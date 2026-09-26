import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { bookingMaintenanceService } from "../../src/modules/bookings/booking-maintenance.service.js";
import { authHeader, createTestUser } from "../helpers/auth.js";
import { createBookableSetup, holdSlot, type BookableSetup } from "../helpers/booking.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";

const MINUTE = 60_000;

async function createStaffBooking(setup: BookableSetup, time: string): Promise<string> {
  const response = await request(app)
    .post(`/api/businesses/${setup.business.id}/bookings`)
    .set(...authHeader(setup.owner))
    .send({
      customer: { name: "Walk In", phone: "+44 7700 900000" },
      serviceId: setup.serviceId,
      startsAt: setup.at(time),
    })
    .expect(201);

  return response.body.id;
}

/** Moves a booking so it started `minutesAgo` minutes ago and lasts an hour. */
async function moveIntoPast(setup: BookableSetup, bookingId: string, minutesAgo: number) {
  const startsAt = new Date(Date.now() - minutesAgo * MINUTE);
  const endsAt = new Date(startsAt.getTime() + 60 * MINUTE);

  await prisma.booking.updateMany({
    where: { id: bookingId, businessId: setup.business.id },
    data: { scheduledAt: startsAt, endsAt, occupiedFrom: startsAt, occupiedUntil: endsAt },
  });
}

function findBooking(setup: BookableSetup, bookingId: string) {
  return prisma.booking.findFirstOrThrow({
    where: { id: bookingId, businessId: setup.business.id },
    select: { status: true, completedAt: true },
  });
}

describe("booking maintenance jobs", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectTestDatabase);

  it("expires lapsed holds as the system and publishes an event", async () => {
    const setup = await createBookableSetup();
    const customer = await createTestUser();
    const lapsed = await holdSlot(customer, setup, setup.at("10:00")).expect(201);
    const active = await holdSlot(customer, setup, setup.at("11:00")).expect(201);

    await prisma.booking.updateMany({
      where: { id: lapsed.body.id, businessId: setup.business.id },
      data: { holdExpiresAt: new Date(Date.now() - MINUTE) },
    });

    await expect(bookingMaintenanceService.expireLapsedHolds()).resolves.toBe(1);
    await expect(findBooking(setup, lapsed.body.id)).resolves.toMatchObject({ status: "EXPIRED" });
    await expect(findBooking(setup, active.body.id)).resolves.toMatchObject({ status: "HELD" });

    const event = await prisma.bookingEvent.findFirstOrThrow({
      where: { businessId: setup.business.id, bookingId: lapsed.body.id, type: "EXPIRE" },
    });

    expect(event).toMatchObject({ actorType: "SYSTEM", actorUserId: null, toStatus: "EXPIRED" });
    await expect(
      prisma.outboxEvent.count({ where: { aggregateId: lapsed.body.id, type: "booking.expired" } }),
    ).resolves.toBe(1);

    // A second run finds nothing left to do.
    await expect(bookingMaintenanceService.expireLapsedHolds()).resolves.toBe(0);
  });

  it("leaves a hold alone once it has been confirmed", async () => {
    const setup = await createBookableSetup();
    const customer = await createTestUser();
    const hold = await holdSlot(customer, setup, setup.at("10:00")).expect(201);

    await request(app)
      .post(`/api/appointments/${hold.body.id}/confirm`)
      .set(...authHeader(customer))
      .expect(200);
    await prisma.booking.updateMany({
      where: { id: hold.body.id, businessId: setup.business.id },
      data: { holdExpiresAt: new Date(Date.now() - MINUTE) },
    });

    await expect(bookingMaintenanceService.expireLapsedHolds()).resolves.toBe(0);
    await expect(findBooking(setup, hold.body.id)).resolves.toMatchObject({ status: "CONFIRMED" });
  });

  it("marks no-shows only for businesses that opted in, after the grace period", async () => {
    const optedOut = await createBookableSetup();
    const optedIn = await createBookableSetup({
      settings: { autoMarkNoShows: true, noShowGraceMinutes: 30 },
    });
    const ignored = await createStaffBooking(optedOut, "10:00");
    const overdue = await createStaffBooking(optedIn, "10:00");
    const inGrace = await createStaffBooking(optedIn, "12:00");

    await moveIntoPast(optedOut, ignored, 120);
    await moveIntoPast(optedIn, overdue, 120);
    await moveIntoPast(optedIn, inGrace, 10);

    await expect(bookingMaintenanceService.markNoShows()).resolves.toBe(1);
    await expect(findBooking(optedIn, overdue)).resolves.toMatchObject({ status: "NO_SHOW" });
    await expect(findBooking(optedIn, inGrace)).resolves.toMatchObject({ status: "CONFIRMED" });
    await expect(findBooking(optedOut, ignored)).resolves.toMatchObject({ status: "CONFIRMED" });
  });

  it("completes checked-in visits an hour after they end", async () => {
    const setup = await createBookableSetup();
    const finished = await createStaffBooking(setup, "10:00");
    const recent = await createStaffBooking(setup, "12:00");

    for (const bookingId of [finished, recent]) {
      await request(app)
        .post(`/api/businesses/${setup.business.id}/bookings/${bookingId}/check-in`)
        .set(...authHeader(setup.owner))
        .expect(200);
    }

    // Ended two hours ago, and ten minutes ago.
    await moveIntoPast(setup, finished, 180);
    await moveIntoPast(setup, recent, 70);

    await expect(bookingMaintenanceService.completeFinishedVisits()).resolves.toBe(1);

    const completed = await findBooking(setup, finished);

    expect(completed.status).toBe("COMPLETED");
    expect(completed.completedAt).toBeInstanceOf(Date);
    await expect(findBooking(setup, recent)).resolves.toMatchObject({ status: "CHECKED_IN" });
  });
});
