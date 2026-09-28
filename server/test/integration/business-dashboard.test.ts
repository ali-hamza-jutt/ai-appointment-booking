import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { realtimeBus } from "../../src/infrastructure/realtime/realtime-bus.js";
import { chatChannels } from "../../src/modules/chat/chat-events.js";
import { ChatOrchestrationService } from "../../src/modules/chat/chat-orchestration.service.js";
import { bookingRealtimeConsumer } from "../../src/modules/outbox/outbox-consumers.js";
import { authHeader, createTestUser, type TestUser } from "../helpers/auth.js";
import { bookSlot, createBookableSetup, type BookableSetup } from "../helpers/booking.js";
import { addTestMember } from "../helpers/business.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";
import { ScriptedProvider } from "../helpers/scripted-provider.js";

describe("business dashboard", () => {
  let setup: BookableSetup;
  let staff: TestUser;
  let customer: TestUser;
  let outsider: TestUser;

  beforeEach(async () => {
    await resetDatabase();
    setup = await createBookableSetup({ daysAhead: 2 });
    staff = await createTestUser({ fullName: "Sana Malik" });
    customer = await createTestUser({ fullName: "Ayesha Khan" });
    outsider = await createTestUser();
    await addTestMember(setup.owner, setup.business, staff, "STAFF");
  });

  afterAll(disconnectTestDatabase);

  describe("customer notes", () => {
    it("lets the team keep private notes on a customer", async () => {
      const created = await request(app)
        .post(`/api/businesses/${setup.business.id}/customers`)
        .set(...authHeader(setup.owner))
        .send({ name: "Walk-in Wendy", phone: "+44 7700 900111" })
        .expect(201);
      const notesUrl = `/api/businesses/${setup.business.id}/customers/${created.body.id}/notes`;

      const saved = await request(app)
        .put(notesUrl)
        .set(...authHeader(staff))
        .send({ notes: "  Prefers a quiet chair. Allergic to lavender oil.  " })
        .expect(200);

      expect(saved.body).toMatchObject({
        customer: { id: created.body.id, name: "Walk-in Wendy" },
        notes: "Prefers a quiet chair. Allergic to lavender oil.",
        noShows: 0,
      });

      const profile = await request(app)
        .get(`/api/businesses/${setup.business.id}/customers/${created.body.id}/profile`)
        .set(...authHeader(setup.owner))
        .expect(200);

      expect(profile.body.notes).toBe("Prefers a quiet chair. Allergic to lavender oil.");

      await request(app).put(notesUrl).set(...authHeader(staff)).send({ notes: "x".repeat(2_001) }).expect(422);
      expect((await request(app).put(notesUrl).set(...authHeader(staff)).send({ notes: "  " }).expect(200)).body.notes).toBeNull();
      await request(app)
        .put(`/api/businesses/${setup.business.id}/customers/${randomUUID()}/notes`)
        .set(...authHeader(staff))
        .send({ notes: "Hi" })
        .expect(404);
      await request(app).put(notesUrl).set(...authHeader(outsider)).send({ notes: "Hi" }).expect(404);
    });
  });

  describe("live booking changes", () => {
    it("tells the dashboard when a booking at the business changes", async () => {
      const received: unknown[] = [];
      const unsubscribe = await realtimeBus.subscribe(chatChannels.business(setup.business.id), (event) => {
        received.push(event);
      });

      try {
        const bookingId = await bookSlot(customer, setup, setup.at("10:00"));
        const event = await prisma.outboxEvent.findFirstOrThrow({
          where: { aggregateId: bookingId, type: "booking.confirmed" },
        });

        expect(bookingRealtimeConsumer.handles("booking.confirmed")).toBe(true);
        expect(bookingRealtimeConsumer.handles("review.submitted")).toBe(false);

        await bookingRealtimeConsumer.handle({
          id: event.id,
          type: event.type,
          businessId: event.businessId,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          payload: event.payload as Record<string, unknown>,
          createdAt: event.createdAt.toISOString(),
        });

        // Redis pub/sub delivers asynchronously.
        for (let attempt = 0; attempt < 50 && received.length === 0; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }

        expect(received).toEqual([{ type: "booking", businessId: setup.business.id, bookingId, status: "CONFIRMED" }]);
      } finally {
        await unsubscribe();
      }
    });
  });

  describe("inbox", () => {
    const provider = new ScriptedProvider();
    const orchestration = new ChatOrchestrationService(provider);
    let sessionId: string;

    const base = () => `/api/businesses/${setup.business.id}/chat-handoffs/${sessionId}`;
    const send = (content: string) =>
      orchestration.processMessage(customer.id, sessionId, { clientMessageId: randomUUID(), content, timeZone: "UTC" });

    beforeEach(async () => {
      const session = await request(app)
        .post("/api/chat/sessions")
        .set(...authHeader(customer))
        .send({ businessSlug: setup.business.slug })
        .expect(201);

      sessionId = session.body.id;
      provider.script(
        { tools: [{ name: "handoff_to_human", args: { reason: "Asks about a refund for last week" } }] },
        { text: "I've passed this to the team; someone will reply here." },
      );
      await send("I want a refund for last week's cut");
    });

    it("lets staff read the whole chat and reply as the business", async () => {
      const thread = await request(app).get(base()).set(...authHeader(staff)).expect(200);

      expect(thread.body).toMatchObject({
        sessionId,
        customer: { name: "Ayesha Khan" },
        reason: "Asks about a refund for last week",
        resolvedAt: null,
      });
      expect(thread.body.messages.map((message: { role: string; sentBy: string | null }) => [message.role, message.sentBy])).toEqual([
        ["USER", null],
        ["ASSISTANT", null],
      ]);

      const reply = await request(app)
        .post(`${base()}/messages`)
        .set(...authHeader(staff))
        .send({ content: "Hi Ayesha, I've refunded it. You'll see it in 3 to 5 days." })
        .expect(201);

      expect(reply.body).toMatchObject({ role: "ASSISTANT", sentBy: "Sana" });

      // The customer sees it in the same chat, under the staff member's name.
      const messages = await request(app)
        .get(`/api/chat/sessions/${sessionId}/messages`)
        .set(...authHeader(customer))
        .expect(200);
      const staffMessage = messages.body.items.find((message: { id: string }) => message.id === reply.body.id);

      expect(staffMessage).toMatchObject({
        role: "ASSISTANT",
        content: "Hi Ayesha, I've refunded it. You'll see it in 3 to 5 days.",
        structuredData: { sentBy: { name: "Sana" } },
      });

      // The assistant reads the team's reply as theirs, not its own.
      provider.script({ text: "Glad that's sorted." });
      await send("Thank you!");

      expect(provider.requests.at(-1)?.messages).toContainEqual(
        expect.objectContaining({
          role: "assistant",
          content: "[Staff member Sana]: Hi Ayesha, I've refunded it. You'll see it in 3 to 5 days.",
        }),
      );
    });

    it("keeps replies to open handoffs at the business", async () => {
      await request(app).post(`${base()}/messages`).set(...authHeader(staff)).send({ content: "" }).expect(422);
      await request(app).post(`${base()}/messages`).set(...authHeader(outsider)).send({ content: "Hi" }).expect(404);
      await request(app).get(base()).set(...authHeader(customer)).expect(404);
      await request(app)
        .post(`/api/businesses/${setup.business.id}/chat-handoffs/${randomUUID()}/messages`)
        .set(...authHeader(staff))
        .send({ content: "Hi" })
        .expect(404);

      await request(app).post(`${base()}/resolve`).set(...authHeader(staff)).expect(204);
      await request(app).post(`${base()}/messages`).set(...authHeader(staff)).send({ content: "Hi" }).expect(409);

      // A resolved chat can still be read.
      expect((await request(app).get(base()).set(...authHeader(staff)).expect(200)).body.resolvedAt).toEqual(expect.any(String));
    });
  });
});
