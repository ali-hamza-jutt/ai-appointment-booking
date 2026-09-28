import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { bookingMaintenanceService } from "../../src/modules/bookings/booking-maintenance.service.js";
import { ChatOrchestrationService } from "../../src/modules/chat/chat-orchestration.service.js";
import type { ChatMessagePart } from "../../src/modules/chat/dto/chat.dto.js";
import type { OutboxMessage } from "../../src/modules/outbox/dto/outbox.dto.js";
import { waitlistService } from "../../src/modules/waitlist/waitlist.service.js";
import { authHeader, createTestUser, type TestUser } from "../helpers/auth.js";
import { bookSlot, createBookableSetup, type BookableSetup } from "../helpers/booking.js";
import { addDays } from "../helpers/dates.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";
import { lastToolResult, ScriptedProvider } from "../helpers/scripted-provider.js";

describe("waitlist", () => {
  let setup: BookableSetup;
  let booker: TestUser;
  let first: TestUser;
  let second: TestUser;

  async function eventFor(bookingId: string, type: string): Promise<OutboxMessage> {
    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: bookingId, type },
      orderBy: { createdAt: "desc" },
    });

    return {
      id: event.id,
      type: event.type,
      businessId: event.businessId,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload as Record<string, unknown>,
      createdAt: event.createdAt.toISOString(),
    };
  }

  function join(user: TestUser, body: Record<string, unknown> = {}) {
    return request(app)
      .post("/api/me/waitlist")
      .set(...authHeader(user))
      .send({
        businessSlug: setup.business.slug,
        serviceId: setup.serviceId,
        fromDate: setup.day,
        toDate: setup.day,
        timeZone: "UTC",
        ...body,
      });
  }

  /** The waitlist hold held for a user, if any. */
  function holdFor(user: TestUser) {
    return prisma.booking.findFirst({
      where: { businessId: setup.business.id, userId: user.id, source: "WAITLIST" },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, scheduledAt: true, holdExpiresAt: true },
    });
  }

  function entryOf(user: TestUser) {
    return prisma.waitlistEntry.findFirstOrThrow({
      where: { businessId: setup.business.id, userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });
  }

  /** Books 10:00 for the booker, then cancels it and delivers the cancellation. */
  async function freeTenOClock(): Promise<void> {
    const bookingId = await bookSlot(booker, setup, setup.at("10:00"));

    await request(app).patch(`/api/appointments/${bookingId}/cancel`).set(...authHeader(booker)).send({}).expect(200);
    await waitlistService.handleBookingEvent(await eventFor(bookingId, "booking.cancelled"));
  }

  beforeEach(async () => {
    await resetDatabase();
    setup = await createBookableSetup({ daysAhead: 2 });
    booker = await createTestUser();
    first = await createTestUser();
    second = await createTestUser();
  });

  afterAll(disconnectTestDatabase);

  it("joins once per wait and checks what is asked for", async () => {
    const joined = await join(first).expect(201);
    const again = await join(first).expect(201);

    expect(joined.body).toMatchObject({
      status: "WAITING",
      service: { id: setup.serviceId, name: "Haircut" },
      fromDate: setup.day,
      toDate: setup.day,
      partOfDay: null,
      offer: null,
    });
    expect(again.body.id).toBe(joined.body.id);

    const mine = await request(app).get("/api/me/waitlist").set(...authHeader(first)).expect(200);

    expect(mine.body.items).toHaveLength(1);

    await join(first, { fromDate: setup.day, toDate: addDays(setup.day, -1) }).expect(422);
    await join(first, { toDate: addDays(setup.day, 90) }).expect(422);
    await join(first, { serviceId: randomUUID() }).expect(404);
    await join(first, { staffId: randomUUID() }).expect(404);

    for (let extra = 1; extra <= 4; extra += 1) {
      await join(first, { toDate: addDays(setup.day, extra) }).expect(201);
    }

    await join(first, { toDate: addDays(setup.day, 10) }).expect(409);
  });

  it("holds a freed time for the first in line for 15 minutes and tells them", async () => {
    await join(first).expect(201);
    await join(second).expect(201);

    const before = Date.now();

    await freeTenOClock();

    const hold = await holdFor(first);
    const holdId = hold?.id ?? "";

    expect(hold).toMatchObject({ status: "HELD", scheduledAt: new Date(setup.at("10:00")) });
    expect(hold?.holdExpiresAt?.getTime()).toBeGreaterThanOrEqual(before + 14 * 60_000);
    expect(hold?.holdExpiresAt?.getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60_000 + 1_000);
    expect(await holdFor(second)).toBeNull();
    expect((await entryOf(first)).status).toBe("OFFERED");
    expect((await entryOf(second)).status).toBe("WAITING");

    const mine = await request(app).get("/api/me/waitlist").set(...authHeader(first)).expect(200);

    expect(mine.body.items[0]).toMatchObject({ status: "OFFERED", offer: { bookingId: holdId, startsAt: setup.at("10:00") } });
    expect(
      await prisma.notification.findMany({
        where: { businessId: setup.business.id, bookingId: holdId },
        select: { kind: true, channel: true, status: true },
      }),
    ).toEqual([{ kind: "WAITLIST_OFFER", channel: "EMAIL", status: "SENT" }]);

    // Staff see who is waiting, in the order they joined.
    const listed = await request(app)
      .get(`/api/businesses/${setup.business.id}/waitlist`)
      .set(...authHeader(setup.owner))
      .expect(200);

    expect(listed.body.items.map((item: { customer: { id: string }; status: string }) => item.status)).toEqual([
      "OFFERED",
      "WAITING",
    ]);
  });

  it("passes the time to the next person when an offer lapses", async () => {
    await join(first).expect(201);
    await join(second).expect(201);
    await freeTenOClock();

    const firstHold = await holdFor(first);
    const firstHoldId = firstHold?.id ?? "";

    await prisma.booking.updateMany({
      where: { businessId: setup.business.id, id: firstHoldId },
      data: { holdExpiresAt: new Date(Date.now() - 1_000) },
    });
    await bookingMaintenanceService.expireLapsedHolds();
    await waitlistService.handleBookingEvent(await eventFor(firstHoldId, "booking.expired"));

    expect(await prisma.waitlistOffer.findFirstOrThrow({ where: { businessId: setup.business.id, bookingId: firstHoldId } })).toMatchObject({
      status: "LAPSED",
    });
    expect((await entryOf(first)).status).toBe("WAITING");
    expect(await holdFor(second)).toMatchObject({ status: "HELD", scheduledAt: new Date(setup.at("10:00")) });
    expect((await entryOf(second)).status).toBe("OFFERED");
  });

  it("books the entry when the customer confirms the held time", async () => {
    await join(first).expect(201);
    await freeTenOClock();

    const hold = await holdFor(first);
    const holdId = hold?.id ?? "";

    await request(app).post(`/api/appointments/${holdId}/confirm`).set(...authHeader(first)).expect(200);
    await waitlistService.handleBookingEvent(await eventFor(holdId, "booking.confirmed"));

    expect((await entryOf(first)).status).toBe("BOOKED");
    expect(await prisma.waitlistOffer.findFirstOrThrow({ where: { businessId: setup.business.id, bookingId: holdId } })).toMatchObject({
      status: "ACCEPTED",
    });
    await request(app).get("/api/me/waitlist").set(...authHeader(first)).expect(200, { items: [] });
  });

  it("passes the time on when the customer leaves the waitlist while it is held", async () => {
    await join(first).expect(201);
    await join(second).expect(201);
    await freeTenOClock();

    const firstHold = await holdFor(first);
    const firstHoldId = firstHold?.id ?? "";

    await request(app).delete(`/api/me/waitlist/${(await entryOf(first)).id}`).set(...authHeader(first)).expect(204);
    expect((await holdFor(first))?.status).toBe("CANCELLED");

    await waitlistService.handleBookingEvent(await eventFor(firstHoldId, "booking.cancelled"));

    expect((await entryOf(first)).status).toBe("LEFT");
    expect(await holdFor(second)).toMatchObject({ status: "HELD" });
    await request(app).delete(`/api/me/waitlist/${(await entryOf(first)).id}`).set(...authHeader(first)).expect(404);
  });

  it("leaves customers alone when the freed time is outside their dates or part of the day", async () => {
    await join(first, { partOfDay: "afternoon" }).expect(201);
    await join(second, { fromDate: addDays(setup.day, 1), toDate: addDays(setup.day, 1) }).expect(201);
    await freeTenOClock();

    expect(await holdFor(first)).toBeNull();
    expect(await holdFor(second)).toBeNull();
    expect((await entryOf(first)).status).toBe("WAITING");
  });

  it("offers the waitlist in chat when nothing fits, and joins with a tap or from the agent", async () => {
    const provider = new ScriptedProvider();
    const orchestration = new ChatOrchestrationService(provider);
    const session = await request(app)
      .post("/api/chat/sessions")
      .set(...authHeader(first))
      .send({ businessSlug: setup.business.slug })
      .expect(201);
    const send = (content: string, extra: Record<string, unknown> = {}) =>
      orchestration.processMessage(first.id, session.body.id, {
        clientMessageId: randomUUID(),
        content,
        timeZone: "UTC",
        ...extra,
      });

    // Nobody works in the evening, so nothing fits.
    provider.script(
      { tools: [{ name: "get_availability", args: { serviceId: setup.serviceId, date: setup.day, partOfDay: "evening" } }] },
      { text: "Nothing is open that evening. Would you like to join the waitlist?" },
    );

    const turn = await send("A haircut that evening?");
    const button = turn.assistantMessage.structuredData?.parts?.find(
      (part): part is Extract<ChatMessagePart, { type: "confirm" }> => part.type === "confirm",
    );

    expect(button?.action).toEqual({
      type: "join_waitlist",
      serviceId: setup.serviceId,
      fromDate: setup.day,
      toDate: setup.day,
      partOfDay: "evening",
    });

    const tapped = await send("Join the waitlist", { action: button?.action });

    expect(tapped.assistantMessage.content).toMatch(/^You're on the waitlist for Haircut, .+ \(evenings\)\. If a time opens up/);
    expect(await prisma.waitlistEntry.count({ where: { businessId: setup.business.id, userId: first.id } })).toBe(1);

    provider.script(
      { tools: [{ name: "join_waitlist", args: { serviceId: setup.serviceId, fromDate: setup.day, partOfDay: "morning" } }] },
      { text: "You're on the waitlist for mornings." },
    );
    await send("Put me on the waitlist for mornings that week");

    expect(lastToolResult(provider.requests.at(-1)?.messages ?? [], "join_waitlist")).toMatchObject({
      joined: { service: "Haircut", from: setup.day, to: addDays(setup.day, 6), partOfDay: "morning" },
    });
    expect(await prisma.waitlistEntry.count({ where: { businessId: setup.business.id, userId: first.id } })).toBe(2);
  });
});
