import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { AiProviderError } from "../../src/integrations/ai/errors/ai-provider.error.js";
import { ChatOrchestrationService } from "../../src/modules/chat/chat-orchestration.service.js";
import type { ChatMessagePart, ChatSlotPickerPart } from "../../src/modules/chat/dto/chat.dto.js";
import { createSlotToken } from "../../src/utils/slot-token.js";
import { authHeader, createTestUser, type TestUser } from "../helpers/auth.js";
import { bookSlot, createBookableSetup, type BookableSetup } from "../helpers/booking.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";
import { lastToolResult, ScriptedProvider } from "../helpers/scripted-provider.js";

interface SlotResult {
  slots: Array<{ slotToken: string; date: string; time: string }>;
}

function partOf<T extends ChatMessagePart["type"]>(parts: ChatMessagePart[] | undefined, type: T) {
  return parts?.find((part) => part.type === type) as Extract<ChatMessagePart, { type: T }> | undefined;
}

describe("booking agent", () => {
  const provider = new ScriptedProvider();
  const orchestration = new ChatOrchestrationService(provider);
  let setup: BookableSetup;
  let customer: TestUser;
  let sessionId: string;

  function send(content: string, extra: Record<string, unknown> = {}) {
    return orchestration.processMessage(customer.id, sessionId, {
      clientMessageId: randomUUID(),
      content,
      timeZone: "UTC",
      ...extra,
    });
  }

  /** Scripts the usual booking path: find the service, check the day, hold a time. */
  function scriptBooking(time: string) {
    provider.script(
      { tools: [{ name: "search_services", args: { query: "haircut" } }] },
      (req) => ({
        tools: [
          {
            name: "get_availability",
            args: {
              serviceId: lastToolResult<{ services: Array<{ serviceId: string }> }>(req.messages, "search_services")
                .services[0]?.serviceId,
              date: setup.day,
            },
          },
        ],
      }),
      (req) => ({
        tools: [
          {
            name: "propose_booking",
            args: {
              slotToken: lastToolResult<SlotResult>(req.messages, "get_availability").slots.find(
                (slot) => slot.time === time,
              )?.slotToken,
            },
          },
        ],
      }),
      { text: "It's held for you — press Confirm booking." },
    );
  }

  beforeEach(async () => {
    await resetDatabase();
    provider.requests.length = 0;
    // Tapping a service shows the next 7 days, so the working day must fall inside them.
    setup = await createBookableSetup({ daysAhead: 2 });
    customer = await createTestUser();

    const session = await request(app)
      .post("/api/chat/sessions")
      .set(...authHeader(customer))
      .send({ businessSlug: setup.business.slug })
      .expect(201);

    sessionId = session.body.id;
  });

  afterAll(disconnectTestDatabase);

  it("finds the service, holds an offered slot and confirms it", async () => {
    scriptBooking("10:00");

    const turn = await send("A haircut next Tuesday at 10 please");
    const parts = turn.assistantMessage.structuredData?.parts;

    expect(turn.assistantMessage.content).toContain("Confirm booking");
    expect(partOf(parts, "booking_summary")?.booking).toMatchObject({
      serviceName: "Haircut",
      staffName: "Sana",
      startsAt: setup.at("10:00"),
      status: "HELD",
    });
    expect(partOf(parts, "confirm")?.action).toEqual({ type: "confirm_booking" });
    expect(turn.session.draft).toMatchObject({
      service: { id: setup.serviceId, name: "Haircut" },
      staff: { id: setup.staffId },
      hold: { startsAt: setup.at("10:00") },
    });
    // The model was told the tools exist and got their results back.
    expect(provider.requests[0]?.tools.map((tool) => tool.name)).toContain("propose_booking");

    const confirmed = await orchestration.confirmBooking(customer.id, sessionId);

    expect(confirmed.appointment).toMatchObject({ status: "CONFIRMED", source: "CHAT" });
    expect(confirmed.session.status).toBe("CLOSED");
  });

  it("refuses slot tokens the model made up or took from another business", async () => {
    const other = await createBookableSetup();
    const foreignToken = createSlotToken({
      businessId: other.business.id,
      serviceId: other.serviceId,
      staffId: null,
      startsAt: new Date(other.at("10:00")),
    });

    provider.script(
      { tools: [{ name: "propose_booking", args: { slotToken: "made-up-token.abc" } }] },
      { tools: [{ name: "propose_booking", args: { slotToken: foreignToken } }] },
      { text: "Sorry, that time isn't on offer." },
    );

    const turn = await send("Book me whatever");
    const toolReplies = provider.requests[2]?.messages.filter((message) => message.role === "tool") ?? [];

    expect(toolReplies).toHaveLength(2);
    for (const reply of toolReplies) expect(reply.role === "tool" && reply.content).toContain("no longer on offer");
    expect(turn.session.draft.hold).toBeNull();
    await expect(prisma.booking.count({ where: { businessId: setup.business.id } })).resolves.toBe(0);
  });

  it("sends invalid arguments back to the model instead of failing", async () => {
    provider.script(
      { tools: [{ name: "get_availability", args: { serviceId: "not-a-uuid", date: "tomorrow" } }] },
      { tools: [{ name: "list_staff", args: "{not json" }] },
      { tools: [{ name: "does_not_exist", args: {} }] },
      { text: "Which service would you like?" },
    );

    const turn = await send("availability?");
    const replies = (provider.requests[3]?.messages ?? []).flatMap((message) =>
      message.role === "tool" ? [JSON.parse(message.content) as { error: string }] : [],
    );

    expect(turn.assistantMessage.content).toBe("Which service would you like?");
    expect(replies.map((reply) => reply.error)).toEqual([
      "Invalid arguments",
      "Arguments were not valid JSON. Call the tool again with a JSON object.",
      "Unknown tool does_not_exist",
    ]);
  });

  it("stops after five tool rounds and makes the model answer", async () => {
    const loop = { tools: [{ name: "search_services", args: {} }] };

    provider.script(loop, loop, loop, loop, loop, { text: "Here are our services." });

    const turn = await send("services?");

    expect(provider.requests).toHaveLength(6);
    expect(provider.requests[5]?.toolChoice).toBe("none");
    expect(turn.assistantMessage.content).toBe("Here are our services.");
    expect(partOf(turn.assistantMessage.structuredData?.parts, "service_cards")?.services[0]?.name).toBe("Haircut");
  });

  it("only lists and proposes changes to the customer's own bookings", async () => {
    const bookingId = await bookSlot(customer, setup, setup.at("11:00"));
    const stranger = await createTestUser();
    const strangersBooking = await bookSlot(stranger, setup, setup.at("13:00"));

    provider.script(
      { tools: [{ name: "list_my_bookings", args: {} }] },
      { tools: [{ name: "propose_cancel", args: { bookingId: strangersBooking } }] },
      { tools: [{ name: "propose_cancel", args: { bookingId } }] },
      { text: "Press Cancel booking to confirm." },
    );

    const turn = await send("Cancel my haircut");
    const listed = lastToolResult<{ bookings: Array<{ bookingId: string }> }>(
      provider.requests[1]?.messages ?? [],
      "list_my_bookings",
    );
    const refused = provider.requests[2]?.messages.at(-1);

    expect(listed.bookings.map((booking) => booking.bookingId)).toEqual([bookingId]);
    expect(refused?.role === "tool" && refused.content).toContain("APPOINTMENT_NOT_FOUND");
    expect(partOf(turn.assistantMessage.structuredData?.parts, "confirm")).toMatchObject({
      tone: "danger",
      action: { type: "cancel_booking", bookingId },
    });

    // Tapping the button cancels without the model.
    const cancelled = await send("Cancel booking", { action: { type: "cancel_booking", bookingId } });

    expect(cancelled.assistantMessage.content).toContain("is cancelled");
    expect(provider.requests).toHaveLength(4);
    await expect(
      prisma.booking.findFirstOrThrow({ where: { id: bookingId, businessId: setup.business.id } }),
    ).resolves.toMatchObject({ status: "CANCELLED" });

    // A stranger's booking can't be cancelled by tapping a forged button either.
    await expect(
      send("Cancel booking", { action: { type: "cancel_booking", bookingId: strangersBooking } }),
    ).rejects.toMatchObject({ code: "APPOINTMENT_NOT_FOUND" });
  });

  it("books and reschedules through taps without calling the model", async () => {
    const picked = await send("Haircut", { action: { type: "select_service", serviceId: setup.serviceId } });
    const picker = partOf(picked.assistantMessage.structuredData?.parts, "slot_picker") as ChatSlotPickerPart;
    const tenAm = picker.slots.find((slot) => slot.startsAt === setup.at("10:00"));

    expect(picker.serviceName).toBe("Haircut");
    expect(tenAm).toBeDefined();

    const held = await send("10:00", { action: { type: "select_slot", slotToken: tenAm?.token } });

    expect(held.session.draft.hold?.startsAt).toBe(setup.at("10:00"));
    expect(held.assistantMessage.structuredData?.confirmationRequired).toBe(true);

    const booked = await orchestration.confirmBooking(customer.id, sessionId);
    const later = createSlotToken({
      businessId: setup.business.id,
      serviceId: setup.serviceId,
      staffId: setup.staffId,
      startsAt: new Date(setup.at("15:00")),
    });

    // Moving a booking works from a new chat too.
    const next = await request(app)
      .post("/api/chat/sessions")
      .set(...authHeader(customer))
      .send({ businessSlug: setup.business.slug })
      .expect(201);

    sessionId = next.body.id;

    const moved = await send("Move it", {
      action: { type: "reschedule_booking", bookingId: booked.appointment.id, slotToken: later },
    });

    expect(moved.assistantMessage.content).toContain("is now on");
    expect(provider.requests).toHaveLength(0);
  });

  it("offers fresh times when a tapped slot was taken meanwhile", async () => {
    const picked = await send("Haircut", { action: { type: "select_service", serviceId: setup.serviceId } });
    const tenAm = (partOf(picked.assistantMessage.structuredData?.parts, "slot_picker") as ChatSlotPickerPart).slots.find(
      (slot) => slot.startsAt === setup.at("10:00"),
    );

    await bookSlot(await createTestUser(), setup, setup.at("10:00"));

    const turn = await send("10:00", { action: { type: "select_slot", slotToken: tenAm?.token } });
    const alternatives = partOf(turn.assistantMessage.structuredData?.parts, "slot_picker");

    expect(turn.assistantMessage.content).toContain("isn't available");
    expect(alternatives?.slots.map((slot) => slot.startsAt)).not.toContain(setup.at("10:00"));
    expect(turn.session.draft.hold).toBeNull();
  });

  it("answers greetings locally and falls back to tap-to-book when the model is down", async () => {
    const greeting = await send("Hello!");

    expect(provider.requests).toHaveLength(0);
    expect(partOf(greeting.assistantMessage.structuredData?.parts, "service_cards")).toBeDefined();

    provider.script(() => {
      throw new AiProviderError("NETWORK_ERROR", "down");
    }, () => {
      throw new AiProviderError("NETWORK_ERROR", "down");
    });

    const fallback = await send("Book a haircut on Tuesday");

    expect(fallback.assistantMessage.content).toContain("assistant is unavailable");
    expect(partOf(fallback.assistantMessage.structuredData?.parts, "service_cards")?.services).toHaveLength(1);
  });

  it("hands the chat to staff, who can see and resolve it", async () => {
    provider.script(
      { tools: [{ name: "handoff_to_human", args: { reason: "Wants to talk about a refund" } }] },
      { text: "I've asked the team to get back to you." },
    );

    const turn = await send("I want to speak to a person about a refund");

    expect(turn.session.handoff).toMatchObject({ reason: "Wants to talk about a refund", resolvedAt: null });

    const list = await request(app)
      .get(`/api/businesses/${setup.business.id}/chat-handoffs`)
      .set(...authHeader(setup.owner))
      .expect(200);

    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      sessionId,
      reason: "Wants to talk about a refund",
      customer: { email: customer.email },
    });
    expect(list.body.items[0].recentMessages.at(-1).content).toContain("get back to you");

    // Customers can't see other businesses' handoffs.
    await request(app)
      .get(`/api/businesses/${setup.business.id}/chat-handoffs`)
      .set(...authHeader(customer))
      .expect(404);

    await request(app)
      .post(`/api/businesses/${setup.business.id}/chat-handoffs/${sessionId}/resolve`)
      .set(...authHeader(setup.owner))
      .expect(204);

    const after = await request(app)
      .get(`/api/businesses/${setup.business.id}/chat-handoffs`)
      .set(...authHeader(setup.owner))
      .expect(200);

    expect(after.body.items).toHaveLength(0);
  });

  it("keeps the structured form as a direct path to a hold", async () => {
    const turn = await send("I completed the form", {
      bookingDetails: { serviceId: setup.serviceId, scheduledDate: setup.day, scheduledTime: "12:00" },
    });

    expect(turn.session.draft.hold?.startsAt).toBe(setup.at("12:00"));
    expect(provider.requests).toHaveLength(0);
  });
});
