import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { isExclusionViolationError } from "../../src/utils/database.js";
import { authHeader, createTestUser } from "../helpers/auth.js";
import { createBookableSetup, holdSlot } from "../helpers/booking.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";

describe("booking concurrency", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectTestDatabase);

  it("gives a contested slot to exactly one of many simultaneous customers", async () => {
    const setup = await createBookableSetup();
    const customers = await Promise.all(
      Array.from({ length: 8 }, () => createTestUser()),
    );

    const results = await Promise.all(
      customers.map((customer) => holdSlot(customer, setup, setup.at("10:00"))),
    );
    const statuses = results.map((result) => result.status).sort();

    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(7);

    const active = await prisma.booking.count({
      where: { businessId: setup.business.id, status: "HELD" },
    });

    expect(active).toBe(1);
  });

  it("sells class seats up to capacity under concurrency", async () => {
    const setup = await createBookableSetup({
      service: { name: "Yoga class", bookingType: "CLASS", capacity: 3 },
    });
    const customers = await Promise.all(
      Array.from({ length: 6 }, () => createTestUser()),
    );

    const results = await Promise.all(
      customers.map((customer) => holdSlot(customer, setup, setup.at("11:00"))),
    );

    expect(results.filter((result) => result.status === 201)).toHaveLength(3);
    expect(results.filter((result) => result.status === 409)).toHaveLength(3);

    const availability = await request(app)
      .get(`/api/public/${setup.business.slug}/availability`)
      .query({ serviceId: setup.serviceId, from: setup.day, to: setup.day })
      .expect(200);
    const times = availability.body.days[0].slots.map((slot: { time: string }) => slot.time);

    expect(times).not.toContain("11:00");
    // A new class may still start when the full one ends.
    expect(times).toContain("12:00");
  });

  it("rejects overlapping bookings at the database even without the service layer", async () => {
    const setup = await createBookableSetup();
    const customer = await createTestUser();
    const first = await holdSlot(customer, setup, setup.at("09:00")).expect(201);
    const original = await prisma.booking.findFirstOrThrow({
      where: { id: first.body.id, businessId: setup.business.id },
    });
    const attempt = prisma.booking.create({
      data: {
        businessId: original.businessId,
        userId: original.userId,
        customerId: original.customerId,
        serviceId: original.serviceId,
        staffId: original.staffId,
        serviceName: original.serviceName,
        timeZone: original.timeZone,
        durationMinutes: original.durationMinutes,
        status: "CONFIRMED",
        sessionKey: "a-different-session",
        scheduledAt: new Date(original.scheduledAt.getTime() + 30 * 60_000),
        endsAt: new Date(original.endsAt.getTime() + 30 * 60_000),
        occupiedFrom: new Date(original.occupiedFrom.getTime() + 30 * 60_000),
        occupiedUntil: new Date(original.occupiedUntil.getTime() + 30 * 60_000),
      },
    });

    await expect(attempt).rejects.toSatisfy(isExclusionViolationError);
  });

  it("expires a lapsed hold inside the next booking's transaction", async () => {
    const setup = await createBookableSetup();
    const first = await createTestUser();
    const second = await createTestUser();
    const hold = await holdSlot(first, setup, setup.at("14:00")).expect(201);

    await prisma.booking.updateMany({
      where: { id: hold.body.id, businessId: setup.business.id },
      data: { holdExpiresAt: new Date(Date.now() - 1_000) },
    });

    await holdSlot(second, setup, setup.at("14:00")).expect(201);

    const expired = await prisma.booking.findFirstOrThrow({
      where: { id: hold.body.id, businessId: setup.business.id },
      select: { status: true },
    });
    const events = await prisma.bookingEvent.findMany({
      where: { bookingId: hold.body.id, businessId: setup.business.id },
      orderBy: { createdAt: "asc" },
      select: { type: true, actorType: true },
    });

    expect(expired.status).toBe("EXPIRED");
    expect(events).toEqual([
      { type: "HOLD", actorType: "CUSTOMER" },
      { type: "EXPIRE", actorType: "SYSTEM" },
    ]);

    const confirmLate = await request(app)
      .post(`/api/appointments/${hold.body.id}/confirm`)
      .set(...authHeader(first))
      .expect(409);

    expect(confirmLate.body.error.code).toBe("BOOKING_TRANSITION_NOT_ALLOWED");
  });

  it("keeps a lapsed hold that nobody else took", async () => {
    const setup = await createBookableSetup();
    const customer = await createTestUser();
    const hold = await holdSlot(customer, setup, setup.at("15:00")).expect(201);

    await prisma.booking.updateMany({
      where: { id: hold.body.id, businessId: setup.business.id },
      data: { holdExpiresAt: new Date(Date.now() - 1_000) },
    });

    const confirmed = await request(app)
      .post(`/api/appointments/${hold.body.id}/confirm`)
      .set(...authHeader(customer))
      .expect(200);

    expect(confirmed.body).toMatchObject({ status: "CONFIRMED", holdExpiresAt: null });
  });

  it("writes an outbox event for every state change", async () => {
    const setup = await createBookableSetup();
    const customer = await createTestUser();
    const hold = await holdSlot(customer, setup, setup.at("16:00")).expect(201);

    await request(app)
      .post(`/api/appointments/${hold.body.id}/confirm`)
      .set(...authHeader(customer))
      .expect(200);

    const outbox = await prisma.outboxEvent.findMany({
      where: { aggregateId: hold.body.id },
      orderBy: { createdAt: "asc" },
      select: { type: true, publishedAt: true, payload: true },
    });

    expect(outbox.map((event) => event.type)).toEqual(["booking.held", "booking.confirmed"]);
    expect(outbox.every((event) => event.publishedAt === null)).toBe(true);
    expect(outbox[1]?.payload).toMatchObject({
      bookingId: hold.body.id,
      status: "CONFIRMED",
      previousStatus: "HELD",
    });
  });
});
