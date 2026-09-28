import { env } from "../../config/env.js";
import { ERROR_CODES, SUBSCRIPTION_CONSTANTS } from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import { subscriptionDal } from "./dal/subscription.dal.js";
import type { PlanId, PlanLimits, SubscriptionRecord } from "./dto/subscription.dto.js";

const { METRICS, PLANS } = SUBSCRIPTION_CONSTANTS;
const ACTIVE = new Set<string>(SUBSCRIPTION_CONSTANTS.ACTIVE_STATUSES);
const UNLIMITED = 2_147_483_647;

type Metric = (typeof METRICS)[keyof typeof METRICS];

/** Plans and their limits apply once Stripe Billing is set up; until then nothing is limited. */
export function billingEnabled(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PRICE_STARTER && env.STRIPE_PRICE_PRO);
}

/** The plan a business is on now: a lapsed or cancelled subscription falls back to Free. */
export function effectivePlan(subscription: Pick<SubscriptionRecord, "plan" | "status"> | null): PlanId {
  return subscription && ACTIVE.has(subscription.status) ? subscription.plan : "FREE";
}

export function limitsOf(plan: PlanId): PlanLimits {
  const { aiConversations, staffSeats, textMessages } = PLANS[plan];

  return { aiConversations, staffSeats, textMessages };
}

const WHAT: Record<Metric | "staffSeats", [one: string, many: string]> = {
  staffSeats: ["provider", "providers"],
  [METRICS.AI_CONVERSATIONS]: ["assistant chat a month", "assistant chats a month"],
  [METRICS.TEXT_MESSAGES]: ["text message a month", "text messages a month"],
};

function limitReached(plan: PlanId, what: [string, string], limit: number): never {
  throw new AppError(
    403,
    ERROR_CODES.PLAN_LIMIT_REACHED,
    `The ${PLANS[plan].name} plan includes ${limit} ${limit === 1 ? what[0] : what[1]}. Upgrade the plan in Billing to get more.`,
  );
}

/**
 * The one place plan limits are checked: staff seats when providers are
 * added, assistant conversations when a chat starts, text messages before
 * one is sent. Usage is counted whether or not limits are enforced.
 */
export const entitlements = {
  async planFor(businessId: string): Promise<{ plan: PlanId; limits: PlanLimits; enforced: boolean }> {
    const plan = effectivePlan(await subscriptionDal.findForBusiness(businessId));

    return { plan, limits: limitsOf(plan), enforced: billingEnabled() };
  },

  /** Refuses another active provider beyond the plan's seats. */
  async assertCanAddStaff(businessId: string): Promise<void> {
    const { enforced, limits, plan } = await this.planFor(businessId);

    if (!enforced) return;
    if ((await subscriptionDal.countActiveStaff(businessId)) >= limits.staffSeats) {
      limitReached(plan, WHAT.staffSeats, limits.staffSeats);
    }
  },

  /** Counts one use of a monthly allowance; false when the plan's allowance is used up. */
  async consume(businessId: string, metric: Metric, at: Date = new Date()): Promise<boolean> {
    const { enforced, limits } = await this.planFor(businessId);
    const limit = !enforced
      ? UNLIMITED
      : metric === METRICS.AI_CONVERSATIONS
        ? limits.aiConversations
        : limits.textMessages;

    return subscriptionDal.consume(businessId, metric, limit, at);
  },

  async consumeOrThrow(businessId: string, metric: Metric, at: Date = new Date()): Promise<void> {
    if (await this.consume(businessId, metric, at)) return;

    const { limits, plan } = await this.planFor(businessId);

    limitReached(plan, WHAT[metric], metric === METRICS.AI_CONVERSATIONS ? limits.aiConversations : limits.textMessages);
  },
};
