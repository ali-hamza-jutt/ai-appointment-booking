import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { PrivacyService } from "../../src/modules/privacy/privacy.service.js";
import { authHeader, createTestUser, type TestUser } from "../helpers/auth.js";
import { bookSlot, createBookableSetup, type BookableSetup } from "../helpers/booking.js";
import { addTestMember } from "../helpers/business.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";

const DAY = 24 * 60 * 60 * 1_000;

describe("privacy", () => {
  let setup: BookableSetup;
  let customer: TestUser;
  let customerId: string;
  let upcomingId: string;

  /** A customer with a finished, reviewed visit, one ahead, a chat, a wait, notes and a message log. */
  async function customerWithHistory(): Promise<void> {
    const base = `/api/businesses/${setup.business.id}/bookings`;
    const visited = await bookSlot(customer, setup, setup.at("10:00"));

    await request(app).post(`${base}/${visited}/check-in`).set(...authHeader(setup.owner)).expect(200);
    await request(app).post(`${base}/${visited}/complete`).set(...authHeader(setup.owner)).expect(200);
    await request(app).post(`/api/appointments/${visited}/review`).set(...authHeader(customer)).send({ rating: 5, comment: "Lovely" }).expect(201);
    upcomingId = await bookSlot(customer, setup, setup.at("12:00"));
    await prisma.booking.updateMany({ where: { businessId: setup.business.id, id: upcomingId }, data: { notes: "Allergic to lavender" } });

    customerId = (await prisma.customer.findFirstOrThrow({ where: { businessId: setup.business.id, userId: customer.id } })).id;
    await request(app)
      .put(`/api/businesses/${setup.business.id}/customers/${customerId}/notes`)
      .set(...authHeader(setup.owner))
      .send({ notes: "Prefers mornings" })
      .expect(200);

    const chat = await request(app)
      .post("/api/chat/sessions")
      .set(...authHeader(customer))
      .send({ businessSlug: setup.business.slug })
      .expect(201);

    await prisma.chatMessage.create({ data: { sessionId: chat.body.id, role: "USER", content: "Do you have Friday?" } });
    await request(app)
      .post("/api/me/waitlist")
      .set(...authHeader(customer))
      .send({ businessSlug: setup.business.slug, serviceId: setup.serviceId, fromDate: setup.day, toDate: setup.day, timeZone: "UTC" })
      .expect(201);
    await prisma.notification.create({
      data: {
        businessId: setup.business.id,
        customerId,
        channel: "EMAIL",
        kind: "BOOKING_CONFIRMED",
        status: "SENT",
        recipient: customer.email,
        dedupeKey: `privacy-test-${customerId}`,
      },
    });
  }

  beforeEach(async () => {
    await resetDatabase();
    setup = await createBookableSetup({ daysAhead: 2 });
    customer = await createTestUser({ fullName: "Ayesha Khan" });
    await customerWithHistory();
  });

  afterAll(disconnectTestDatabase);

  it("lets a business export and erase what it holds about a customer", async () => {
    const base = `/api/businesses/${setup.business.id}/customers/${customerId}`;
    const exported = await request(app).get(`${base}/data-export`).set(...authHeader(setup.owner)).expect(200);

    expect(exported.body).toMatchObject({
      business: { id: setup.business.id, name: "Glow Salon" },
      customer: { id: customerId, name: "Ayesha Khan", email: customer.email, notes: "Prefers mornings" },
      reviews: [{ rating: 5, comment: "Lovely" }],
      waitlist: [{ serviceName: "Haircut", fromDate: setup.day, status: "WAITING" }],
      chats: [{ messages: [{ role: "USER", content: "Do you have Friday?" }] }],
      notifications: [{ channel: "EMAIL", recipient: customer.email }],
    });
    expect(exported.body.bookings).toHaveLength(2);

    // Not while an appointment is ahead.
    expect((await request(app).post(`${base}/erase`).set(...authHeader(setup.owner)).expect(409)).body.error.code).toBe(
      "UPCOMING_BOOKINGS_EXIST",
    );

    const staff = await createTestUser();

    await addTestMember(setup.owner, setup.business, staff, "STAFF");
    await request(app).get(`${base}/data-export`).set(...authHeader(staff)).expect(403);
    await request(app).post(`${base}/erase`).set(...authHeader(await createTestUser())).expect(404);

    await request(app).patch(`/api/appointments/${upcomingId}/cancel`).set(...authHeader(customer)).send({}).expect(200);
    await request(app).post(`${base}/erase`).set(...authHeader(setup.owner)).expect(204);

    expect(await prisma.customer.findFirst({ where: { businessId: setup.business.id, id: customerId } })).toMatchObject({
      name: "Deleted customer",
      email: null,
      phone: null,
      notes: null,
      userId: null,
    });

    const where = { businessId: setup.business.id, customerId };

    // The bookings stay as the business's records, without notes.
    expect(await prisma.booking.findMany({ where, select: { notes: true } })).toEqual([{ notes: null }, { notes: null }]);
    expect(await prisma.review.count({ where })).toBe(0);
    expect(await prisma.waitlistEntry.count({ where })).toBe(0);
    expect(await prisma.notification.count({ where })).toBe(0);
    expect(await prisma.chatSession.count({ where: { businessId: setup.business.id, userId: customer.id } })).toBe(0);
  });

  it("lets a person download their data and delete their account", async () => {
    const exported = await request(app).get("/api/me/data/export").set(...authHeader(customer)).expect(200);

    expect(exported.body).toMatchObject({
      account: { id: customer.id, email: customer.email, fullName: "Ayesha Khan" },
      businesses: [{ business: { id: setup.business.id }, customer: { id: customerId } }],
    });

    const remove = (user: TestUser, confirmEmail: string) =>
      request(app).post("/api/me/data/delete-account").set(...authHeader(user)).send({ confirmEmail });

    await remove(customer, "someone-else@example.com").expect(422);
    await remove(customer, customer.email).expect(409);
    // An owner who would leave their business with nobody in charge can't go.
    expect((await remove(setup.owner, setup.owner.email).expect(409)).body.error.code).toBe("SOLE_OWNER");

    await request(app).patch(`/api/appointments/${upcomingId}/cancel`).set(...authHeader(customer)).send({}).expect(200);

    const deleted = await remove(customer, `  ${customer.email.toUpperCase()} `).expect(204);

    expect(deleted.headers["set-cookie"]?.[0]).toMatch(/^bw_refresh=;/);
    expect(await prisma.user.findUnique({ where: { id: customer.id } })).toBeNull();
    expect(await prisma.customer.findFirst({ where: { businessId: setup.business.id, id: customerId } })).toMatchObject({
      name: "Deleted customer",
      email: null,
      userId: null,
    });
    expect(await prisma.booking.count({ where: { businessId: setup.business.id, customerId } })).toBe(2);
    await request(app).post("/api/auth/sign-in").send({ email: customer.email, password: "Password123" }).expect(401);
  });

  it("deletes chats older than a business's retention period each night", async () => {
    const service = new PrivacyService();
    const other = await createBookableSetup({ daysAhead: 2 });
    const otherChat = await request(app)
      .post("/api/chat/sessions")
      .set(...authHeader(customer))
      .send({ businessSlug: other.business.slug })
      .expect(201);

    // Every chat is 40 days old; only Glow Salon keeps chats for 30 days.
    await prisma.chatSession.updateMany({ where: { userId: customer.id }, data: { updatedAt: new Date(Date.now() - 40 * DAY) } });
    await request(app)
      .patch(`/api/businesses/${setup.business.id}/settings`)
      .set(...authHeader(setup.owner))
      .send({ chatRetentionDays: 30 })
      .expect(200);

    expect(await service.purgeOldChats()).toBe(1);
    expect(await prisma.chatSession.count({ where: { businessId: setup.business.id } })).toBe(0);
    expect(await prisma.chatSession.findUnique({ where: { id: otherChat.body.id } })).not.toBeNull();
  });
});
