import {
  ADMIN_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  JOB_CONSTANTS,
  VALIDATION_PATTERNS,
} from "../../constants/app.constants.js";
import { createQueue } from "../../infrastructure/queue/queues.js";
import { getRedis } from "../../infrastructure/redis/redis.js";
import { AppError } from "../../middleware/app-error.js";
import { createAccessToken } from "../../utils/jwt.js";
import { normalizeWhitespace } from "../../utils/text.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { authDal } from "../auth/dal/auth.dal.js";
import { toAuthUserResponse } from "../auth/session.service.js";
import { adminAuditDal } from "./dal/admin-audit.dal.js";
import { adminDal } from "./dal/admin.dal.js";
import type {
  AdminAuditLogResponse,
  AdminBusinessDetail,
  AdminBusinessListResponse,
  AdminBusinessSummary,
  AdminUserListResponse,
  FailedJobResponse,
  FailedWorkResponse,
  ImpersonationResponse,
} from "./dto/admin.dto.js";

const QUEUE_NAMES: readonly string[] = Object.values(JOB_CONSTANTS.QUEUES);

type BusinessRow = NonNullable<Awaited<ReturnType<typeof adminDal.findBusiness>>>;

function daysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function cleanSearch(search: string | undefined): string | undefined {
  const trimmed = search?.trim();

  return trimmed ? trimmed.slice(0, 100) : undefined;
}

/**
 * The platform admin's tools: every tenant at a glance, suspending abusive
 * ones, acting as a user to support them, model spend, and failed work.
 * Every change an admin makes is written to the audit log.
 */
export class AdminService {
  public async listBusinesses(search: string | undefined, now: Date = new Date()): Promise<AdminBusinessListResponse> {
    const businesses = await adminDal.listBusinesses(cleanSearch(search), ADMIN_CONSTANTS.LIST_LIMIT, now);
    const costs = await adminDal.costByBusiness(
      businesses.map((business) => business.id),
      daysAgo(now, ADMIN_CONSTANTS.SPEND_DAYS),
    );

    return { items: businesses.map((business) => this.toSummary(business, costs.get(business.id) ?? 0)) };
  }

  public async getBusiness(businessId: string, now: Date = new Date()): Promise<AdminBusinessDetail> {
    const business = await this.findBusiness(businessId, now);
    const usage = await adminDal.listUsage(business.id, daysAgo(now, ADMIN_CONSTANTS.SPEND_DAYS));
    const days = new Map<string, AdminBusinessDetail["llmUsage"][number]>();
    const models = new Map<string, { model: string; requests: number; costUsd: number }>();

    for (const row of usage) {
      const date = row.date.toISOString().slice(0, 10);
      const day = days.get(date) ?? { date, requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      const model = models.get(row.model) ?? { model: row.model, requests: 0, costUsd: 0 };

      day.requests += row.requests;
      day.inputTokens += Number(row.inputTokens);
      day.outputTokens += Number(row.outputTokens);
      day.costUsd += row.costUsd;
      model.requests += row.requests;
      model.costUsd += row.costUsd;
      days.set(date, day);
      models.set(row.model, model);
    }

    const total = [...models.values()].reduce((sum, model) => sum + model.costUsd, 0);

    return {
      ...this.toSummary(business, total),
      team: business.memberships.map((membership) => ({
        userId: membership.user.id,
        fullName: membership.user.fullName,
        email: membership.user.email,
        role: membership.role,
      })),
      llmUsage: [...days.values()],
      llmUsageByModel: [...models.values()].sort((a, b) => b.costUsd - a.costUsd),
    };
  }

  /** Stops a business taking bookings; its team can still look. */
  public async suspend(adminId: string, businessId: string, reasonInput: string, now: Date = new Date()): Promise<AdminBusinessDetail> {
    const reason = normalizeWhitespace(reasonInput);

    if (reason.length < 3) throwRequestValidationError("reason", "Say why, so the business's team knows");

    await this.findBusiness(businessId, now);
    await adminDal.setSuspended(businessId, { at: now, reason });
    await adminAuditDal.record({ adminId, action: "business.suspend", targetType: "business", targetId: businessId, details: { reason } });

    return this.getBusiness(businessId, now);
  }

  public async unsuspend(adminId: string, businessId: string, now: Date = new Date()): Promise<AdminBusinessDetail> {
    await this.findBusiness(businessId, now);
    await adminDal.setSuspended(businessId, null);
    await adminAuditDal.record({ adminId, action: "business.unsuspend", targetType: "business", targetId: businessId });

    return this.getBusiness(businessId, now);
  }

  public async listUsers(search: string | undefined): Promise<AdminUserListResponse> {
    return { items: await adminDal.listUsers(cleanSearch(search), ADMIN_CONSTANTS.LIST_LIMIT) };
  }

  /**
   * A short access token for acting as another user, to see what they see.
   * It carries the admin's id, so every change made with it is audited, and
   * it can't be refreshed: when it ends, the admin's own session is back.
   */
  public async impersonate(adminId: string, userId: string): Promise<ImpersonationResponse> {
    const target = VALIDATION_PATTERNS.UUID.test(userId) ? await authDal.findUserById(userId) : null;
    const admin = await authDal.findUserById(adminId);

    if (!target || !admin) throw new AppError(404, ERROR_CODES.USER_NOT_FOUND, ERROR_MESSAGES.USER_NOT_FOUND);
    if (target.platformRole === "ADMIN") {
      throw new AppError(403, ERROR_CODES.CANNOT_IMPERSONATE_ADMIN, ERROR_MESSAGES.CANNOT_IMPERSONATE_ADMIN);
    }

    const expiresIn = ADMIN_CONSTANTS.IMPERSONATION_TTL_SECONDS;
    const accessToken = await createAccessToken({ subject: target.id, email: target.email, impersonatorId: admin.id }, expiresIn);

    await adminAuditDal.record({
      adminId,
      action: "impersonation.start",
      targetType: "user",
      targetId: target.id,
      details: { email: target.email },
    });

    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn,
      user: { ...toAuthUserResponse(target), impersonatedBy: admin.fullName },
    };
  }

  /** Jobs that ran out of retries on every queue, and outbox events the relay gave up on. */
  public async listFailedWork(): Promise<FailedWorkResponse> {
    const outboxEvents = await adminDal.listDeadOutboxEvents(JOB_CONSTANTS.OUTBOX_MAX_ATTEMPTS, ADMIN_CONSTANTS.LIST_LIMIT);

    if (!getRedis()) return { queuesAvailable: false, jobs: [], outboxEvents };

    const jobs: FailedJobResponse[] = [];

    for (const name of QUEUE_NAMES) {
      const queue = createQueue(name);

      try {
        for (const job of await queue.getFailed(0, ADMIN_CONSTANTS.FAILED_JOBS_PER_QUEUE - 1)) {
          if (!job.id) continue;

          jobs.push({
            queue: name,
            id: job.id,
            name: job.name,
            failedReason: job.failedReason ? job.failedReason.slice(0, 500) : null,
            attemptsMade: job.attemptsMade,
            failedAt: job.finishedOn ? new Date(job.finishedOn) : null,
          });
        }
      } finally {
        await queue.close();
      }
    }

    jobs.sort((a, b) => (b.failedAt?.getTime() ?? 0) - (a.failedAt?.getTime() ?? 0));

    return { queuesAvailable: true, jobs, outboxEvents };
  }

  /** Runs a failed job again. */
  public async retryJob(adminId: string, queueName: string, jobId: string): Promise<void> {
    if (!getRedis()) throw new AppError(503, ERROR_CODES.QUEUES_UNAVAILABLE, ERROR_MESSAGES.QUEUES_UNAVAILABLE);
    if (!QUEUE_NAMES.includes(queueName)) throw new AppError(404, ERROR_CODES.JOB_NOT_FOUND, ERROR_MESSAGES.JOB_NOT_FOUND);

    const queue = createQueue(queueName);

    try {
      const job = await queue.getJob(jobId);

      if (!job || !(await job.isFailed())) throw new AppError(404, ERROR_CODES.JOB_NOT_FOUND, ERROR_MESSAGES.JOB_NOT_FOUND);

      await job.retry();
      await adminAuditDal.record({
        adminId,
        action: "job.retry",
        targetType: "job",
        targetId: `${queueName}/${jobId}`,
        details: { name: job.name },
      });
    } finally {
      await queue.close();
    }
  }

  /** Puts an outbox event the relay gave up on back in line; its consumers are idempotent, so repeats are safe. */
  public async replayOutboxEvent(adminId: string, eventId: string): Promise<void> {
    const replayed =
      VALIDATION_PATTERNS.UUID.test(eventId) && (await adminDal.replayOutboxEvent(eventId, JOB_CONSTANTS.OUTBOX_MAX_ATTEMPTS));

    if (!replayed) throw new AppError(404, ERROR_CODES.OUTBOX_EVENT_NOT_FOUND, ERROR_MESSAGES.OUTBOX_EVENT_NOT_FOUND);

    await adminAuditDal.record({ adminId, action: "outbox.replay", targetType: "outbox_event", targetId: eventId });
  }

  public async listAuditLog(): Promise<AdminAuditLogResponse> {
    const entries = await adminAuditDal.list(ADMIN_CONSTANTS.AUDIT_LOG_LIMIT);

    return {
      items: entries.map((entry) => ({
        ...entry,
        details: (entry.details as Record<string, unknown> | null) ?? null,
      })),
    };
  }

  private async findBusiness(businessId: string, now: Date): Promise<BusinessRow> {
    const business = VALIDATION_PATTERNS.UUID.test(businessId) ? await adminDal.findBusiness(businessId, now) : null;

    if (!business) throw new AppError(404, ERROR_CODES.BUSINESS_NOT_FOUND, ERROR_MESSAGES.BUSINESS_NOT_FOUND);

    return business;
  }

  private toSummary(business: BusinessRow, llmCost: number): AdminBusinessSummary {
    const owner = business.memberships.find((membership) => membership.role === "OWNER")?.user ?? null;

    return {
      id: business.id,
      name: business.name,
      slug: business.slug,
      createdAt: business.createdAt,
      suspension: business.suspendedAt ? { at: business.suspendedAt, reason: business.suspendedReason } : null,
      owner,
      memberCount: business.memberships.length,
      bookingsLast30Days: business._count.bookings,
      llmCostLast30DaysUsd: Math.round(llmCost * 10_000) / 10_000,
    };
  }
}

export const adminService = new AdminService();
