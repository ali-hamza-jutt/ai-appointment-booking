import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { AnalyticsService } from "../../src/modules/analytics/analytics.service.js";
import { ChatOrchestrationService } from "../../src/modules/chat/chat-orchestration.service.js";
import type { ChatMessagePart } from "../../src/modules/chat/dto/chat.dto.js";
import { authHeader, createTestUser, type TestUser } from "../helpers/auth.js";
import { bookSlot, createBookableSetup, holdSlot, type BookableSetup } from "../helpers/booking.js";
import { addTestMember } from "../helpers/business.js";
import { addDays } from "../helpers/dates.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";
import { ScriptedProvider } from "../helpers/scripted-provider.js";

describe("analytics", () => {
  let setup: BookableSetup;
  let today: string;
  const service = new AnalyticsService();

  function analytics(query: Record<string, string>, user: TestUser = setup.owner) {
    return request(app).get(`/api/businesses/${setup.business.id}/analytics`).query(query).set(...authHeader(user));
  }

  async function book(time: string): Promise<string> {
    return bookSlot(await createTestUser(), setup, setup.at(time));
  }

  /** Completed at 10:00, no-show at 11:00, cancelled at 12:00, a released hold at 13:00 and a booking at 14:00. */
  async function bookTheDay(): Promise<void> {
    const base = `/api/businesses/${setup.business.id}/bookings`;
    const completed = await book("10:00");

    await request(app).post(`${base}/${completed}/check-in`).set(...authHeader(setup.owner)).expect(200);
    await request(app).post(`${base}/${completed}/complete`).set(...authHeader(setup.owner)).expect(200);

    const noShow = await book("11:00");

    // Marking a no-show waits until the visit has started, so set it directly.
    await prisma.booking.updateMany({ where: { businessId: setup.business.id, id: noShow }, data: { status: "NO_SHOW" } });

    const cancelledBy = await createTestUser();
    const cancelled = await bookSlot(cancelledBy, setup, setup.at("12:00"));

    await request(app).patch(`/api/appointments/${cancelled}/cancel`).set(...authHeader(cancelledBy)).send({}).expect(200);

    const releasedBy = await createTestUser();
    const released = await holdSlot(releasedBy, setup, setup.at("13:00")).expect(201);

    await request(app).patch(`/api/appointments/${released.body.id}/cancel`).set(...authHeader(releasedBy)).send({}).expect(200);
    await book("14:00");
  }

  beforeEach(async () => {
    await resetDatabase();
    setup = await createBookableSetup({ daysAhead: 2 });
    today = addDays(setup.day, -2);
  });

  afterAll(disconnectTestDatabase);

  it("counts bookings, revenue, cancellations, no-shows, busy hours and how full providers are", async () => {
    await bookTheDay();
    // An hour off leaves seven of the eight working hours open.
    await request(app)
      .post(`/api/businesses/${setup.business.id}/staff/${setup.staffId}/time-off`)
      .set(...authHeader(setup.owner))
      .send({ startsAt: setup.at("16:00"), endsAt: setup.at("17:00") })
      .expect(201);

    const response = await analytics({ from: today, to: setup.day }).expect(200);
    const { durationMinutes, priceMinor: price } = await prisma.booking.findFirstOrThrow({
      where: { businessId: setup.business.id, status: "COMPLETED" },
    });
    const visitDay = response.body.days.find((day: { date: string }) => day.date === setup.day);

    expect(response.body.days.map((day: { date: string }) => day.date)).toEqual([today, addDays(today, 1), setup.day]);
    // The released hold was never a booking, so it is neither made nor cancelled.
    expect(response.body.days[0]).toMatchObject({ bookingsMade: 4 });
    expect(visitDay).toEqual({
      date: setup.day,
      bookingsMade: 0,
      visits: 3,
      completed: 1,
      cancelled: 1,
      noShows: 1,
      revenueMinor: price,
    });
    expect(response.body.totals).toMatchObject({ cancellationRate: 0.25, noShowRate: 0.5, revenueMinor: price });
    expect(response.body.currency).toBe("USD");
    expect(
      response.body.busiestHours.filter((hour: { visits: number }) => hour.visits > 0),
    ).toEqual([
      { hour: 10, visits: 1 },
      { hour: 11, visits: 1 },
      { hour: 14, visits: 1 },
    ]);
    expect(response.body.providers).toEqual([
      {
        staffId: setup.staffId,
        name: expect.any(String),
        // The completed visit, the no-show and the one still booked.
        bookedMinutes: 3 * durationMinutes,
        openMinutes: 420,
        utilisation: Math.round(((3 * durationMinutes) / 420) * 1_000) / 1_000,
      },
    ]);
  });

  it("measures how the assistant turns chats into bookings and where the rest stop", async () => {
    const provider = new ScriptedProvider();
    const orchestration = new ChatOrchestrationService(provider);

    async function chat(user: TestUser): Promise<{ sessionId: string; send: (content: string, extra?: Record<string, unknown>) => ReturnType<ChatOrchestrationService["processMessage"]> }> {
      const session = await request(app)
        .post("/api/chat/sessions")
        .set(...authHeader(user))
        .send({ businessSlug: setup.business.slug })
        .expect(201);

      return {
        sessionId: session.body.id,
        send: (content, extra = {}) =>
          orchestration.processMessage(user.id, session.body.id, { clientMessageId: randomUUID(), content, timeZone: "UTC", ...extra }),
      };
    }

    // One chat books.
    const booker = await createTestUser();
    const booking = await chat(booker);

    provider.script(
      { tools: [{ name: "get_availability", args: { serviceId: setup.serviceId, date: setup.day } }] },
      { text: "Here are some times." },
    );

    const offered = await booking.send("A haircut please");
    const picker = offered.assistantMessage.structuredData?.parts?.find(
      (part): part is Extract<ChatMessagePart, { type: "slot_picker" }> => part.type === "slot_picker",
    );

    await booking.send("That one", { action: { type: "select_slot", slotToken: picker?.slots[0]?.token } });
    await orchestration.confirmBooking(booker.id, booking.sessionId);

    // One is handed to staff before choosing anything, and one stops at a held time.
    const handedOff = await chat(await createTestUser());

    provider.script({ tools: [{ name: "handoff_to_human", args: { reason: "Wants a person" } }] }, { text: "Passing you on." });
    await handedOff.send("Can I talk to someone?");

    const heldUser = await createTestUser();
    const held = await chat(heldUser);

    provider.script(
      { tools: [{ name: "get_availability", args: { serviceId: setup.serviceId, date: setup.day } }] },
      { text: "Here are some times." },
    );

    const heldOffer = await held.send("Haircut?");
    const heldPicker = heldOffer.assistantMessage.structuredData?.parts?.find(
      (part): part is Extract<ChatMessagePart, { type: "slot_picker" }> => part.type === "slot_picker",
    );

    await held.send("That one", { action: { type: "select_slot", slotToken: heldPicker?.slots[1]?.token } });

    // A chat nobody wrote in doesn't count.
    await chat(await createTestUser());

    const response = await analytics({ from: today, to: today }).expect(200);

    expect(response.body.assistant).toEqual({
      chatsStarted: 3,
      chatsBooked: 1,
      conversionRate: 0.333,
      averageTurnsToBook: 2,
      handoffs: 1,
      handoffRate: 0.333,
      dropOff: { beforeChoosingService: 1, afterChoosingService: 0, atHeldTime: 1 },
    });
  });

  it("stores finished days nightly and reads them back without recounting", async () => {
    await bookTheDay();

    const dayAfter = new Date(`${addDays(setup.day, 1)}T12:00:00Z`);

    // The night after the visits, the last three days are stored.
    await service.storeRecentDays(dayAfter);
    expect(await prisma.dailyMetric.count({ where: { businessId: setup.business.id, date: new Date(`${setup.day}T00:00:00Z`) } })).toBeGreaterThan(0);

    // A later change isn't seen until the next night recomputes the day.
    await prisma.booking.updateMany({ where: { businessId: setup.business.id, status: "CONFIRMED" }, data: { status: "CANCELLED" } });

    const stored = await service.getAnalytics(setup.business.id, setup.day, setup.day, dayAfter);

    expect(stored.totals).toMatchObject({ visits: 3, cancelled: 1 });

    await service.storeRecentDays(dayAfter);
    expect((await service.getAnalytics(setup.business.id, setup.day, setup.day, dayAfter)).totals).toMatchObject({
      visits: 2,
      cancelled: 2,
    });
  });

  it("checks the dates and who is asking", async () => {
    await analytics({ from: setup.day, to: today }).expect(422);
    await analytics({ from: addDays(today, -100), to: today }).expect(422);
    await analytics({ from: "yesterday" }).expect(422);

    const defaults = await analytics({}).expect(200);

    expect(defaults.body.days).toHaveLength(30);
    expect(defaults.body.to).toBe(today);

    const staff = await createTestUser();

    await addTestMember(setup.owner, setup.business, staff, "STAFF");
    await analytics({}, staff).expect(403);
    await analytics({}, await createTestUser()).expect(404);
  });
});
