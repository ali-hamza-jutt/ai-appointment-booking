import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import type { EmailMessage, Mailer } from "../../src/infrastructure/messaging/mailer.js";
import { ChatOrchestrationService } from "../../src/modules/chat/chat-orchestration.service.js";
import type { OutboxMessage } from "../../src/modules/outbox/dto/outbox.dto.js";
import { reviewAlertsConsumer } from "../../src/modules/outbox/outbox-consumers.js";
import { ReviewService } from "../../src/modules/reviews/review.service.js";
import { authHeader, createTestUser, type TestUser } from "../helpers/auth.js";
import { bookSlot, createBookableSetup, type BookableSetup } from "../helpers/booking.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";
import { lastToolResult, ScriptedProvider } from "../helpers/scripted-provider.js";

const DAY = 24 * 60 * 60 * 1_000;

describe("reviews", () => {
  let setup: BookableSetup;
  let ayesha: TestUser;
  let bilal: TestUser;
  let emails: EmailMessage[];
  let failNextEmail: boolean;

  const mailer: Mailer = {
    send: (message) => {
      if (failNextEmail) {
        failNextEmail = false;
        return Promise.reject(new Error("SMTP unavailable"));
      }

      emails.push(message);
      return Promise.resolve();
    },
  };

  /** Books, checks in and completes a visit. */
  async function visit(customer: TestUser, time: string): Promise<string> {
    const bookingId = await bookSlot(customer, setup, setup.at(time));
    const base = `/api/businesses/${setup.business.id}/bookings/${bookingId}`;

    await request(app).post(`${base}/check-in`).set(...authHeader(setup.owner)).expect(200);
    await request(app).post(`${base}/complete`).set(...authHeader(setup.owner)).expect(200);

    return bookingId;
  }

  function review(customer: TestUser, bookingId: string, body: Record<string, unknown>) {
    return request(app).post(`/api/appointments/${bookingId}/review`).set(...authHeader(customer)).send(body);
  }

  async function submittedEvent(reviewId: string): Promise<OutboxMessage> {
    const event = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: reviewId, type: "review.submitted" } });

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

  function moderate(reviewId: string, body: Record<string, unknown>) {
    return request(app)
      .patch(`/api/businesses/${setup.business.id}/reviews/${reviewId}`)
      .set(...authHeader(setup.owner))
      .send(body);
  }

  beforeEach(async () => {
    await resetDatabase();
    emails = [];
    failNextEmail = false;
    setup = await createBookableSetup({ daysAhead: 2 });
    ayesha = await createTestUser({ fullName: "Ayesha Khan" });
    bilal = await createTestUser({ fullName: "Bilal" });
  });

  afterAll(disconnectTestDatabase);

  it("lets a customer rate a finished visit once", async () => {
    const bookingId = await bookSlot(ayesha, setup, setup.at("10:00"));
    const mine = () => request(app).get(`/api/appointments/${bookingId}/review`).set(...authHeader(ayesha)).expect(200);

    // Not before the visit has happened.
    expect((await mine()).body).toEqual({ canReview: false, review: null });
    await review(ayesha, bookingId, { rating: 5 }).expect(409);

    const base = `/api/businesses/${setup.business.id}/bookings/${bookingId}`;

    await request(app).post(`${base}/check-in`).set(...authHeader(setup.owner)).expect(200);
    await request(app).post(`${base}/complete`).set(...authHeader(setup.owner)).expect(200);
    expect((await mine()).body).toEqual({ canReview: true, review: null });

    await review(ayesha, bookingId, { rating: 0 }).expect(422);
    await review(ayesha, bookingId, { rating: 6 }).expect(422);
    await review(ayesha, bookingId, { rating: 4.5 }).expect(422);
    await review(ayesha, bookingId, { rating: 4, comment: "x".repeat(2_001) }).expect(422);
    await review(bilal, bookingId, { rating: 4 }).expect(404);

    const saved = await review(ayesha, bookingId, { rating: 4, comment: "  Great cut, a little late.  " }).expect(201);

    expect(saved.body).toMatchObject({
      bookingId,
      rating: 4,
      comment: "Great cut, a little late.",
      status: "PENDING",
      reply: null,
      serviceName: "Haircut",
    });
    await review(ayesha, bookingId, { rating: 5 }).expect(409);
    expect((await mine()).body).toMatchObject({ canReview: false, review: { id: saved.body.id, rating: 4 } });
  });

  it("doesn't take reviews of cancelled visits or ones that ended over 30 days ago", async () => {
    const cancelled = await bookSlot(ayesha, setup, setup.at("10:00"));

    await request(app).patch(`/api/appointments/${cancelled}/cancel`).set(...authHeader(ayesha)).send({}).expect(200);
    await review(ayesha, cancelled, { rating: 5 }).expect(409);

    const old = await visit(ayesha, "11:00");

    await prisma.booking.updateMany({
      where: { businessId: setup.business.id, id: old },
      data: { completedAt: new Date(Date.now() - 31 * DAY) },
    });
    await review(ayesha, old, { rating: 5 }).expect(409);
  });

  it("shows reviews on the booking page only once staff publish them, with their answer", async () => {
    const first = await review(ayesha, await visit(ayesha, "10:00"), { rating: 5, comment: "Lovely" }).expect(201);
    const second = await review(bilal, await visit(bilal, "11:00"), { rating: 3 }).expect(201);
    const publicList = () => request(app).get(`/api/public/${setup.business.slug}/reviews`).expect(200);

    expect((await publicList()).body).toEqual({ average: null, count: 0, items: [] });

    const listed = await request(app)
      .get(`/api/businesses/${setup.business.id}/reviews`)
      .set(...authHeader(setup.owner))
      .expect(200);

    expect(listed.body.summary).toEqual({ average: 4, count: 2, pending: 2 });
    expect(listed.body.items.map((item: { customer: { name: string } }) => item.customer.name)).toEqual(["Bilal", "Ayesha Khan"]);

    const published = await moderate(first.body.id, { status: "PUBLISHED", reply: " Thanks, Ayesha! " }).expect(200);

    expect(published.body).toMatchObject({ status: "PUBLISHED", reply: "Thanks, Ayesha!", repliedAt: expect.any(String) });
    await moderate(second.body.id, { status: "PUBLISHED" }).expect(200);

    expect((await publicList()).body).toMatchObject({
      average: 4,
      count: 2,
      items: [
        { rating: 3, author: "Bilal", reply: null },
        { rating: 5, comment: "Lovely", author: "Ayesha K.", serviceName: "Haircut", reply: "Thanks, Ayesha!" },
      ],
    });

    await moderate(second.body.id, { status: "HIDDEN" }).expect(200);
    expect(await moderate(first.body.id, { reply: "" }).expect(200)).toMatchObject({ body: { reply: null, repliedAt: null } });
    expect((await publicList()).body).toMatchObject({ average: 5, count: 1, items: [{ rating: 5, reply: null }] });

    const hidden = await request(app)
      .get(`/api/businesses/${setup.business.id}/reviews?status=HIDDEN`)
      .set(...authHeader(setup.owner))
      .expect(200);

    expect(hidden.body.items).toHaveLength(1);
    await moderate(first.body.id, { status: "PENDING" }).expect(422);
    await moderate(randomUUID(), { status: "HIDDEN" }).expect(404);
    await request(app).get(`/api/businesses/${setup.business.id}/reviews`).set(...authHeader(ayesha)).expect(404);
  });

  it("emails owners about a low rating once, and retries when sending fails", async () => {
    const service = new ReviewService(mailer);
    const low = await review(ayesha, await visit(ayesha, "10:00"), { rating: 2, comment: "Waited 30 minutes" }).expect(201);
    const good = await review(bilal, await visit(bilal, "11:00"), { rating: 4 }).expect(201);
    const lowEvent = await submittedEvent(low.body.id);

    expect(reviewAlertsConsumer.handles("review.submitted")).toBe(true);

    failNextEmail = true;
    await expect(service.handleReviewEvent(lowEvent)).rejects.toThrow("SMTP unavailable");
    await service.handleReviewEvent(lowEvent);
    await service.handleReviewEvent(lowEvent);
    await service.handleReviewEvent(await submittedEvent(good.body.id));

    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ to: setup.owner.email, subject: "2 stars for Haircut at Glow Salon" });
    expect(emails[0]?.text).toContain('Ayesha Khan rated their Haircut');
    expect(emails[0]?.text).toContain('"Waited 30 minutes"');
    expect(emails[0]?.text).toContain("/business/reviews");
  });

  it("lets the assistant tell customers what published reviews say", async () => {
    const saved = await review(ayesha, await visit(ayesha, "10:00"), { rating: 5, comment: "Best fade in town" }).expect(201);

    await review(bilal, await visit(bilal, "11:00"), { rating: 1 }).expect(201);
    await moderate(saved.body.id, { status: "PUBLISHED" }).expect(200);

    const provider = new ScriptedProvider();
    const orchestration = new ChatOrchestrationService(provider);
    const session = await request(app)
      .post("/api/chat/sessions")
      .set(...authHeader(bilal))
      .send({ businessSlug: setup.business.slug })
      .expect(201);

    provider.script({ tools: [{ name: "get_reviews", args: {} }] }, { text: "Customers rate us 5 out of 5." });
    await orchestration.processMessage(bilal.id, session.body.id, {
      clientMessageId: randomUUID(),
      content: "Are your haircuts any good?",
      timeZone: "UTC",
    });

    // The unpublished 1-star review stays out of it.
    expect(lastToolResult(provider.requests.at(-1)?.messages ?? [], "get_reviews")).toMatchObject({
      average: 5,
      count: 1,
      latest: [{ rating: 5, service: "Haircut", comment: "Best fade in town", reply: null }],
    });
  });
});
