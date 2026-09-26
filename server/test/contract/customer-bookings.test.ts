import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { authHeader, createTestUser } from "../helpers/auth.js";
import { bookSlot, createBookableSetup, holdSlot } from "../helpers/booking.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";

describe("customer appointments API", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectTestDatabase);

  it("holds, confirms and lists an appointment with business details", async () => {
    const setup = await createBookableSetup();
    const customer = await createTestUser();

    const hold = await holdSlot(customer, setup, setup.at("10:00")).expect(201);

    expect(hold.body).toMatchObject({
      status: "HELD",
      serviceName: "Haircut",
      staff: { id: setup.staffId, name: "Sana" },
      business: { slug: setup.business.slug },
      priceMinor: 3_000,
      currency: "USD",
      durationMinutes: 60,
    });
    expect(new Date(hold.body.holdExpiresAt).getTime()).toBeGreaterThan(Date.now());

    const confirmed = await request(app)
      .post(`/api/appointments/${hold.body.id}/confirm`)
      .set(...authHeader(customer))
      .expect(200);

    expect(confirmed.body).toMatchObject({ status: "CONFIRMED", canCancel: true });

    // Confirming twice is harmless.
    await request(app)
      .post(`/api/appointments/${hold.body.id}/confirm`)
      .set(...authHeader(customer))
      .expect(200);

    const list = await request(app)
      .get("/api/appointments")
      .set(...authHeader(customer))
      .expect(200);

    expect(list.body.items).toHaveLength(1);

    const customers = await prisma.customer.findMany({
      where: { businessId: setup.business.id, userId: customer.id },
    });

    expect(customers).toHaveLength(1);
  });

  it("requires approval when the business does not auto-confirm", async () => {
    const setup = await createBookableSetup({ settings: { autoConfirmBookings: false } });
    const customer = await createTestUser();
    const hold = await holdSlot(customer, setup, setup.at("11:00")).expect(201);

    const pending = await request(app)
      .post(`/api/appointments/${hold.body.id}/confirm`)
      .set(...authHeader(customer))
      .expect(200);

    expect(pending.body.status).toBe("PENDING");

    const approved = await request(app)
      .post(`/api/businesses/${setup.business.id}/bookings/${hold.body.id}/approve`)
      .set(...authHeader(setup.owner))
      .expect(200);

    expect(approved.body.status).toBe("CONFIRMED");
  });

  it("refuses times outside working hours and past times", async () => {
    const setup = await createBookableSetup();
    const customer = await createTestUser();

    const closed = await holdSlot(customer, setup, setup.at("18:00")).expect(409);

    expect(closed.body.error.code).toBe("APPOINTMENT_SLOT_UNAVAILABLE");

    await holdSlot(customer, setup, "2020-01-07T10:00:00.000Z").expect(422);
  });

  it("enforces the cancellation window", async () => {
    const setup = await createBookableSetup({
      settings: { cancellationWindowHours: 720 },
    });
    const customer = await createTestUser();
    const bookingId = await bookSlot(customer, setup, setup.at("12:00"));

    const detail = await request(app)
      .get(`/api/appointments/${bookingId}`)
      .set(...authHeader(customer))
      .expect(200);

    expect(detail.body).toMatchObject({ canCancel: false, canReschedule: false });

    const refused = await request(app)
      .patch(`/api/appointments/${bookingId}/cancel`)
      .set(...authHeader(customer))
      .send({})
      .expect(409);

    expect(refused.body.error.code).toBe("APPOINTMENT_CANCELLATION_NOT_ALLOWED");

    // Staff are not bound by the customer window.
    await request(app)
      .post(`/api/businesses/${setup.business.id}/bookings/${bookingId}/cancel`)
      .set(...authHeader(setup.owner))
      .send({ reason: "Stylist is ill" })
      .expect(200);
  });

  it("cancels and frees the slot for someone else", async () => {
    const setup = await createBookableSetup();
    const first = await createTestUser();
    const second = await createTestUser();
    const bookingId = await bookSlot(first, setup, setup.at("13:00"));

    const cancelled = await request(app)
      .patch(`/api/appointments/${bookingId}/cancel`)
      .set(...authHeader(first))
      .send({ reason: "Change of plans" })
      .expect(200);

    expect(cancelled.body).toMatchObject({ status: "CANCELLED", cancelReason: "Change of plans" });

    await holdSlot(second, setup, setup.at("13:00")).expect(201);
  });

  it("reschedules within the limit and only onto open slots", async () => {
    const setup = await createBookableSetup({ settings: { rescheduleLimit: 1 } });
    const customer = await createTestUser();
    const other = await createTestUser();
    const bookingId = await bookSlot(customer, setup, setup.at("09:00"));
    await bookSlot(other, setup, setup.at("15:00"));

    await request(app)
      .patch(`/api/appointments/${bookingId}/reschedule`)
      .set(...authHeader(customer))
      .send({ scheduledDate: setup.day, scheduledTime: "15:00" })
      .expect(409);

    const moved = await request(app)
      .patch(`/api/appointments/${bookingId}/reschedule`)
      .set(...authHeader(customer))
      .send({ scheduledDate: setup.day, scheduledTime: "14:00" })
      .expect(200);

    expect(moved.body).toMatchObject({
      scheduledAt: setup.at("14:00"),
      rescheduleCount: 1,
      canReschedule: false,
    });

    const again = await request(app)
      .patch(`/api/appointments/${bookingId}/reschedule`)
      .set(...authHeader(customer))
      .send({ scheduledDate: setup.day, scheduledTime: "16:00" })
      .expect(409);

    expect(again.body.error.code).toBe("APPOINTMENT_RESCHEDULE_NOT_ALLOWED");
  });

  it("never shows one customer's appointment to another", async () => {
    const setup = await createBookableSetup();
    const owner = await createTestUser();
    const stranger = await createTestUser();
    const bookingId = await bookSlot(owner, setup, setup.at("10:00"));

    await request(app)
      .get(`/api/appointments/${bookingId}`)
      .set(...authHeader(stranger))
      .expect(404);
    await request(app)
      .patch(`/api/appointments/${bookingId}/cancel`)
      .set(...authHeader(stranger))
      .send({})
      .expect(404);

    const list = await request(app)
      .get("/api/appointments")
      .set(...authHeader(stranger))
      .expect(200);

    expect(list.body.items).toHaveLength(0);
  });
});
