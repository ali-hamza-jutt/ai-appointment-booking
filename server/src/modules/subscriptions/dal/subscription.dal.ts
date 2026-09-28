import { randomUUID } from "node:crypto";

import { prisma } from "../../../infrastructure/database/prisma.js";
import type { SubscriptionRecord, SubscriptionUpsert } from "../dto/subscription.dto.js";

const subscriptionSelect = {
  id: true,
  businessId: true,
  plan: true,
  status: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
} as const;

/** The first day of the month `at` falls in (UTC), as YYYY-MM-DD. */
export function monthOf(at: Date): string {
  return `${at.toISOString().slice(0, 7)}-01`;
}

export class SubscriptionDal {
  public findForBusiness(businessId: string): Promise<SubscriptionRecord | null> {
    return prisma.subscription.findFirst({ where: { businessId }, select: subscriptionSelect });
  }

  public findByStripeSubscription(stripeSubscriptionId: string): Promise<SubscriptionRecord | null> {
    return prisma.subscription.findFirst({ where: { stripeSubscriptionId }, select: subscriptionSelect });
  }

  public findByStripeCustomer(stripeCustomerId: string): Promise<SubscriptionRecord | null> {
    return prisma.subscription.findFirst({ where: { stripeCustomerId }, select: subscriptionSelect });
  }

  /** Creates or replaces the business's one subscription row. */
  public async save(businessId: string, data: SubscriptionUpsert): Promise<void> {
    const existing = await prisma.subscription.findFirst({ where: { businessId }, select: { id: true } });

    if (existing) {
      await prisma.subscription.updateMany({ where: { businessId, id: existing.id }, data });
    } else {
      await prisma.subscription.create({ data: { businessId, ...data } });
    }
  }

  public async remove(businessId: string): Promise<void> {
    await prisma.subscription.deleteMany({ where: { businessId } });
  }

  public countActiveStaff(businessId: string): Promise<number> {
    return prisma.staff.count({ where: { businessId, isActive: true } });
  }

  /**
   * Counts one more use of a monthly allowance, unless that would pass
   * `limit`. The check and the count are one statement, so two requests
   * can't both take the last one. True when it was counted.
   */
  public async consume(businessId: string, metric: string, limit: number, at: Date): Promise<boolean> {
    if (limit <= 0) return false;

    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "usage_counters" ("id", "business_id", "month", "metric", "count")
      VALUES (${randomUUID()}::uuid, ${businessId}::uuid, ${monthOf(at)}::date, ${metric}, 1)
      ON CONFLICT ("business_id", "month", "metric") DO UPDATE SET "count" = "usage_counters"."count" + 1
        WHERE "usage_counters"."count" < ${limit}
      RETURNING "count"
    `;

    return rows.length === 1;
  }

  public async monthlyUsage(businessId: string, at: Date): Promise<Map<string, number>> {
    const counters = await prisma.usageCounter.findMany({
      where: { businessId, month: new Date(`${monthOf(at)}T00:00:00Z`) },
      select: { metric: true, count: true },
    });

    return new Map(counters.map((counter) => [counter.metric, counter.count]));
  }
}

export const subscriptionDal = new SubscriptionDal();
