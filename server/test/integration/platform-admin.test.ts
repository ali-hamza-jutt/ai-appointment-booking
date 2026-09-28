import { randomUUID } from "node:crypto";

import { Worker } from "bullmq";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { JOB_CONSTANTS } from "../../src/constants/app.constants.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { llmUsageRecorder } from "../../src/infrastructure/observability/llm-usage.js";
import { createQueue, QUEUE_PREFIX } from "../../src/infrastructure/queue/queues.js";
import { createRedisConnection } from "../../src/infrastructure/redis/redis.js";
import { authHeader, createTestUser, type TestUser } from "../helpers/auth.js";
import { createBookableSetup, holdSlot, type BookableSetup } from "../helpers/booking.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";
import { resetRedis } from "../helpers/redis.js";

describe("platform admin", () => {
  let setup: BookableSetup;
  let admin: TestUser;

  async function makeAdmin(fullName: string): Promise<TestUser> {
    const user = await createTestUser({ fullName });

    await prisma.user.update({ where: { id: user.id }, data: { platformRole: "ADMIN" } });

    return user;
  }

  function auditActions() {
    return prisma.adminAuditLog.findMany({ orderBy: { createdAt: "asc" }, select: { action: true, targetId: true, details: true } });
  }

  beforeEach(async () => {
    await resetDatabase();
    await resetRedis();
    setup = await createBookableSetup({ daysAhead: 2 });
    admin = await makeAdmin("Ada Admin");
  });

  afterAll(disconnectTestDatabase);

  it("lists tenants with their owner, recent bookings and model spend, for admins only", async () => {
    await request(app).get("/api/admin/businesses").set(...authHeader(setup.owner)).expect(403);

    await holdSlot(await createTestUser(), setup, setup.at("10:00")).expect(201);
    await llmUsageRecorder.record({ businessId: setup.business.id, model: "mistral-small-latest", inputTokens: 1_000_000, outputTokens: 0 });
    await llmUsageRecorder.record({ businessId: setup.business.id, model: "mistral-small-latest", inputTokens: 0, outputTokens: 1_000_000 });

    const listed = await request(app).get("/api/admin/businesses").query({ search: "glow" }).set(...authHeader(admin)).expect(200);

    expect(listed.body.items).toEqual([
      expect.objectContaining({
        id: setup.business.id,
        owner: expect.objectContaining({ id: setup.owner.id }),
        memberCount: 1,
        bookingsLast30Days: 1,
        llmCostLast30DaysUsd: 0.4,
        suspension: null,
      }),
    ]);
    expect((await request(app).get("/api/admin/businesses").query({ search: "nothing-like-it" }).set(...authHeader(admin)).expect(200)).body.items).toEqual([]);

    const detail = await request(app).get(`/api/admin/businesses/${setup.business.id}`).set(...authHeader(admin)).expect(200);

    expect(detail.body.llmUsage).toEqual([
      { date: new Date().toISOString().slice(0, 10), requests: 2, inputTokens: 1_000_000, outputTokens: 1_000_000, costUsd: 0.4 },
    ]);
    expect(detail.body.llmUsageByModel).toEqual([{ model: "mistral-small-latest", requests: 2, costUsd: 0.4 }]);
    expect(detail.body.team).toEqual([expect.objectContaining({ userId: setup.owner.id, role: "OWNER" })]);
    await request(app).get(`/api/admin/businesses/${randomUUID()}`).set(...authHeader(admin)).expect(404);
  });

  it("suspends a business: no bookings or public page, and its team can only read", async () => {
    await request(app)
      .post(`/api/admin/businesses/${setup.business.id}/suspend`)
      .set(...authHeader(admin))
      .send({ reason: " " })
      .expect(422);

    const suspended = await request(app)
      .post(`/api/admin/businesses/${setup.business.id}/suspend`)
      .set(...authHeader(admin))
      .send({ reason: "Spam bookings reported by customers" })
      .expect(200);

    expect(suspended.body.suspension).toEqual({ at: expect.any(String), reason: "Spam bookings reported by customers" });

    await request(app).get(`/api/public/${setup.business.slug}`).expect(404);
    await holdSlot(await createTestUser(), setup, setup.at("10:00")).expect(404);

    const business = await request(app).get(`/api/businesses/${setup.business.id}`).set(...authHeader(setup.owner)).expect(200);

    expect(business.body.suspension).toMatchObject({ reason: "Spam bookings reported by customers" });

    const blocked = await request(app)
      .patch(`/api/businesses/${setup.business.id}/settings`)
      .set(...authHeader(setup.owner))
      .send({ slotStepMinutes: 30 })
      .expect(403);

    expect(blocked.body.error.code).toBe("BUSINESS_SUSPENDED");

    await request(app).post(`/api/admin/businesses/${setup.business.id}/unsuspend`).set(...authHeader(admin)).expect(200);
    await request(app).get(`/api/public/${setup.business.slug}`).expect(200);
    expect((await auditActions()).map((entry) => entry.action)).toEqual(["business.suspend", "business.unsuspend"]);
  });

  it("acts as a user for 15 minutes, with every change in the audit log", async () => {
    const started = await request(app).post(`/api/admin/users/${setup.owner.id}/impersonate`).set(...authHeader(admin)).expect(200);

    expect(started.body).toMatchObject({ tokenType: "Bearer", expiresIn: 900, user: { id: setup.owner.id, impersonatedBy: "Ada Admin" } });

    const asOwner: TestUser = { ...setup.owner, accessToken: started.body.accessToken };
    const me = await request(app).get("/api/auth/me").set(...authHeader(asOwner)).expect(200);

    expect(me.body).toMatchObject({ id: setup.owner.id, impersonatedBy: "Ada Admin", platformRole: "USER" });
    expect((await request(app).get("/api/auth/me").set(...authHeader(admin)).expect(200)).body).toMatchObject({
      platformRole: "ADMIN",
      impersonatedBy: null,
    });

    await request(app)
      .patch(`/api/businesses/${setup.business.id}/settings`)
      .set(...authHeader(asOwner))
      .send({ slotStepMinutes: 30 })
      .expect(200);
    // The borrowed session can't reach the admin tools.
    await request(app).get("/api/admin/businesses").set(...authHeader(asOwner)).expect(403);

    // The request is audited in the background.
    for (let attempt = 0; attempt < 50 && (await auditActions()).length < 2; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(await auditActions()).toEqual([
      { action: "impersonation.start", targetId: setup.owner.id, details: { email: setup.owner.email } },
      {
        action: "impersonation.request",
        targetId: setup.owner.id,
        details: { method: "PATCH", path: `/api/businesses/${setup.business.id}/settings` },
      },
    ]);

    await request(app)
      .post(`/api/admin/users/${(await makeAdmin("Other Admin")).id}/impersonate`)
      .set(...authHeader(admin))
      .expect(403);
    await request(app).post(`/api/admin/users/${randomUUID()}/impersonate`).set(...authHeader(admin)).expect(404);

    const users = await request(app).get("/api/admin/users").query({ search: setup.owner.email }).set(...authHeader(admin)).expect(200);

    expect(users.body.items).toEqual([expect.objectContaining({ id: setup.owner.id, platformRole: "USER" })]);
  });

  it("shows failed jobs and given-up outbox events and runs them again", async () => {
    const queue = createQueue(JOB_CONSTANTS.QUEUES.NOTIFICATIONS);
    const worker = new Worker(
      JOB_CONSTANTS.QUEUES.NOTIFICATIONS,
      () => Promise.reject(new Error("SMTP unavailable")),
      { connection: createRedisConnection(), prefix: QUEUE_PREFIX },
    );
    const eventId = randomUUID();

    try {
      await queue.add("send-reminder", { bookingId: randomUUID() }, { jobId: "reminder-that-failed", attempts: 1 });

      for (let attempt = 0; attempt < 100 && !(await (await queue.getJob("reminder-that-failed"))?.isFailed()); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await worker.close();
      await prisma.outboxEvent.create({
        data: {
          id: eventId,
          businessId: setup.business.id,
          type: "booking.confirmed",
          aggregateType: "booking",
          aggregateId: randomUUID(),
          payload: {},
          attempts: JOB_CONSTANTS.OUTBOX_MAX_ATTEMPTS,
        },
      });

      const failed = await request(app).get("/api/admin/jobs/failed").set(...authHeader(admin)).expect(200);

      expect(failed.body).toMatchObject({
        queuesAvailable: true,
        jobs: [{ queue: "notifications", id: "reminder-that-failed", name: "send-reminder", failedReason: "SMTP unavailable", attemptsMade: 1 }],
        outboxEvents: [{ id: eventId, type: "booking.confirmed", attempts: JOB_CONSTANTS.OUTBOX_MAX_ATTEMPTS }],
      });

      await request(app).post("/api/admin/jobs/notifications/reminder-that-failed/retry").set(...authHeader(admin)).expect(204);
      expect(await (await queue.getJob("reminder-that-failed"))?.isFailed()).toBe(false);
      await request(app).post("/api/admin/jobs/notifications/reminder-that-failed/retry").set(...authHeader(admin)).expect(404);
      await request(app).post("/api/admin/jobs/not-a-queue/1/retry").set(...authHeader(admin)).expect(404);

      await request(app).post(`/api/admin/outbox/${eventId}/replay`).set(...authHeader(admin)).expect(204);
      expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: eventId } })).attempts).toBe(0);
      await request(app).post(`/api/admin/outbox/${eventId}/replay`).set(...authHeader(admin)).expect(404);

      const log = await request(app).get("/api/admin/audit-log").set(...authHeader(admin)).expect(200);

      expect(log.body.items.map((entry: { action: string }) => entry.action)).toEqual(["outbox.replay", "job.retry"]);
      expect(log.body.items[0].admin).toMatchObject({ id: admin.id, fullName: "Ada Admin" });
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
