import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { authHeader, createTestUser } from "../helpers/auth.js";
import { bookSlot, createBookableSetup } from "../helpers/booking.js";
import { addTestMember, createTestBusiness } from "../helpers/business.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";

describe("business bookings API", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectTestDatabase);

  it("books a walk-in customer and lists bookings by date", async () => {
    const setup = await createBookableSetup();
    const staff = await createTestUser();
    await addTestMember(setup.owner, setup.business, staff, "STAFF");

    const created = await request(app)
      .post(`/api/businesses/${setup.business.id}/bookings`)
      .set(...authHeader(staff))
      .send({
        customer: { name: "Walk In", phone: "+44 7700 900000" },
        serviceId: setup.serviceId,
        startsAt: setup.at("10:00"),
      })
      .expect(201);

    expect(created.body).toMatchObject({
      status: "CONFIRMED",
      source: "STAFF",
      customer: { name: "Walk In" },
      staff: { id: setup.staffId },
    });

    const list = await request(app)
      .get(`/api/businesses/${setup.business.id}/bookings`)
      .query({ from: setup.at("00:00"), to: `${setup.day}T23:59:59.000Z` })
      .set(...authHeader(staff))
      .expect(200);

    expect(list.body.items).toHaveLength(1);

    const conflict = await request(app)
      .post(`/api/businesses/${setup.business.id}/bookings`)
      .set(...authHeader(staff))
      .send({
        customerId: created.body.customer.id,
        serviceId: setup.serviceId,
        startsAt: setup.at("10:00"),
      })
      .expect(409);

    expect(conflict.body.error.code).toBe("APPOINTMENT_SLOT_UNAVAILABLE");
  });

  it("runs check-in, completion and keeps an audit trail", async () => {
    const setup = await createBookableSetup();
    const customer = await createTestUser();
    const bookingId = await bookSlot(customer, setup, setup.at("11:00"));
    const base = `/api/businesses/${setup.business.id}/bookings/${bookingId}`;

    await request(app).post(`${base}/complete`).set(...authHeader(setup.owner)).expect(409);

    const checkedIn = await request(app)
      .post(`${base}/check-in`)
      .set(...authHeader(setup.owner))
      .expect(200);

    expect(checkedIn.body.status).toBe("CHECKED_IN");

    const completed = await request(app)
      .post(`${base}/complete`)
      .set(...authHeader(setup.owner))
      .expect(200);

    expect(completed.body.completedAt).toBeTruthy();

    const events = await request(app)
      .get(`${base}/events`)
      .set(...authHeader(setup.owner))
      .expect(200);

    expect(events.body.items.map((event: { type: string }) => event.type)).toEqual([
      "HOLD",
      "CONFIRM",
      "CHECK_IN",
      "COMPLETE",
    ]);
    expect(events.body.items[2]).toMatchObject({ actorType: "STAFF", actorUserId: setup.owner.id });
  });

  it("marks a no-show only after the grace period", async () => {
    const setup = await createBookableSetup();
    const customer = await createTestUser();
    const bookingId = await bookSlot(customer, setup, setup.at("12:00"));
    const base = `/api/businesses/${setup.business.id}/bookings/${bookingId}`;

    const early = await request(app)
      .post(`${base}/no-show`)
      .set(...authHeader(setup.owner))
      .expect(409);

    expect(early.body.error.code).toBe("BOOKING_POLICY_VIOLATION");

    const startedAt = new Date(Date.now() - 60 * 60_000);
    const endedAt = new Date(startedAt.getTime() + 60 * 60_000);

    await prisma.booking.updateMany({
      where: { id: bookingId, businessId: setup.business.id },
      data: {
        scheduledAt: startedAt,
        endsAt: endedAt,
        occupiedFrom: startedAt,
        occupiedUntil: endedAt,
      },
    });

    const noShow = await request(app)
      .post(`${base}/no-show`)
      .set(...authHeader(setup.owner))
      .expect(200);

    expect(noShow.body.status).toBe("NO_SHOW");
  });

  it("reschedules onto another staff member", async () => {
    const setup = await createBookableSetup();
    const customer = await createTestUser();
    const bookingId = await bookSlot(customer, setup, setup.at("09:00"));
    const second = await request(app)
      .post(`/api/businesses/${setup.business.id}/staff`)
      .set(...authHeader(setup.owner))
      .send({ displayName: "Omar", services: [{ serviceId: setup.serviceId }] })
      .expect(201);

    await request(app)
      .put(`/api/businesses/${setup.business.id}/staff/${second.body.id}/working-hours`)
      .set(...authHeader(setup.owner))
      .send({ items: [{ weekday: 2, startTime: "09:00", endTime: "17:00" }] })
      .expect(200);

    const moved = await request(app)
      .patch(`/api/businesses/${setup.business.id}/bookings/${bookingId}/reschedule`)
      .set(...authHeader(setup.owner))
      .send({ startsAt: setup.at("09:00"), staffId: second.body.id })
      .expect(200);

    expect(moved.body.staff).toMatchObject({ id: second.body.id, name: "Omar" });
  });

  it("shows staff the open times without online-only limits", async () => {
    const setup = await createBookableSetup({ service: { onlineBookable: false } });
    const customer = await createTestUser();

    await request(app)
      .get(`/api/public/${setup.business.slug}/availability`)
      .query({ serviceId: setup.serviceId, from: setup.day, to: setup.day })
      .expect(404);

    const staffView = await request(app)
      .get(`/api/businesses/${setup.business.id}/availability`)
      .query({ serviceId: setup.serviceId, from: setup.day, to: setup.day })
      .set(...authHeader(setup.owner))
      .expect(200);

    expect(staffView.body.days[0].slots).toHaveLength(8);

    await request(app)
      .post("/api/appointments/holds")
      .set(...authHeader(customer))
      .send({ businessSlug: setup.business.slug, serviceId: setup.serviceId, startsAt: setup.at("10:00") })
      .expect(404);
  });

  it("keeps each business's bookings private", async () => {
    const setup = await createBookableSetup();
    const customer = await createTestUser();
    const bookingId = await bookSlot(customer, setup, setup.at("10:00"));
    const otherOwner = await createTestUser();
    const other = await createTestBusiness(otherOwner, { name: "Other Salon" });

    await request(app)
      .get(`/api/businesses/${setup.business.id}/bookings/${bookingId}`)
      .set(...authHeader(otherOwner))
      .expect(404);
    await request(app)
      .get(`/api/businesses/${other.id}/bookings/${bookingId}`)
      .set(...authHeader(otherOwner))
      .expect(404);
  });
});
