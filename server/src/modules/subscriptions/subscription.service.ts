import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { ERROR_CODES, ERROR_MESSAGES, SUBSCRIPTION_CONSTANTS } from "../../constants/app.constants.js";
import { StripeClient, type BillingGateway } from "../../integrations/stripe/stripe.client.js";
import { AppError } from "../../middleware/app-error.js";
import { adminAuditDal } from "../admin/dal/admin-audit.dal.js";
import { subscriptionDal } from "./dal/subscription.dal.js";
import type {
  BillingRedirectResponse,
  BillingResponse,
  PlanId,
  PlanResponse,
  SubscriptionRecord,
} from "./dto/subscription.dto.js";
import { billingEnabled, effectivePlan, limitsOf } from "./entitlements.js";

const { COMPLIMENTARY_STATUS, METRICS, PLANS } = SUBSCRIPTION_CONSTANTS;
const ACTIVE = new Set<string>(SUBSCRIPTION_CONSTANTS.ACTIVE_STATUSES);
const SUBSCRIPTION_EVENTS = new Set<string>(SUBSCRIPTION_CONSTANTS.SUBSCRIPTION_EVENTS);
const PLAN_IDS: PlanId[] = ["FREE", "STARTER", "PRO"];

interface StripeEventLike {
  type: string;
  data: { object: Record<string, unknown> };
}

function text(object: Record<string, unknown>, key: string): string | null {
  const value = object[key];

  return typeof value === "string" && value ? value : null;
}

function toPlan(id: PlanId): PlanResponse {
  return { id, name: PLANS[id].name, priceMonthlyUsd: PLANS[id].priceMonthlyUsd, limits: limitsOf(id) };
}

/** The plan a Stripe price is for, by the configured price ids. */
function planForPrice(priceId: string | null): PlanId | null {
  if (priceId && priceId === env.STRIPE_PRICE_STARTER) return "STARTER";
  if (priceId && priceId === env.STRIPE_PRICE_PRO) return "PRO";
  return null;
}

/** A Stripe subscription is live when it still has a paid plan's status. */
function hasLiveStripeSubscription(subscription: SubscriptionRecord | null): boolean {
  return Boolean(subscription?.stripeSubscriptionId && ACTIVE.has(subscription.status) && subscription.status !== COMPLIMENTARY_STATUS);
}

/**
 * What businesses pay BookWise. Owners subscribe through Stripe Checkout
 * and manage the subscription in Stripe's billing portal; Stripe's webhooks
 * keep the plan here in step. Platform admins can grant a plan for free.
 */
export class SubscriptionService {
  public constructor(private readonly gatewayFactory: () => BillingGateway | null = createBillingGateway) {}

  public async getBilling(businessId: string, now: Date = new Date()): Promise<BillingResponse> {
    const [subscription, usage, staffSeats] = await Promise.all([
      subscriptionDal.findForBusiness(businessId),
      subscriptionDal.monthlyUsage(businessId, now),
      subscriptionDal.countActiveStaff(businessId),
    ]);
    const plan = effectivePlan(subscription);
    const source = plan === "FREE" ? "free" : subscription?.status === COMPLIMENTARY_STATUS ? "complimentary" : "stripe";

    return {
      enabled: billingEnabled(),
      plan: toPlan(plan),
      source,
      status: plan === "FREE" ? null : (subscription?.status ?? null),
      currentPeriodEnd: plan === "FREE" ? null : (subscription?.currentPeriodEnd ?? null),
      cancelAtPeriodEnd: plan !== "FREE" && (subscription?.cancelAtPeriodEnd ?? false),
      canManageInPortal: billingEnabled() && Boolean(subscription?.stripeCustomerId),
      usage: {
        staffSeats,
        aiConversations: usage.get(METRICS.AI_CONVERSATIONS) ?? 0,
        textMessages: usage.get(METRICS.TEXT_MESSAGES) ?? 0,
      },
      plans: PLAN_IDS.map(toPlan),
    };
  }

  /** Sends the owner to Stripe Checkout to subscribe; a business already subscribed changes plan in the portal. */
  public async startCheckout(businessId: string, plan: "STARTER" | "PRO", ownerEmail: string): Promise<BillingRedirectResponse> {
    const gateway = this.requireGateway();
    const subscription = await subscriptionDal.findForBusiness(businessId);

    if (hasLiveStripeSubscription(subscription)) {
      throw new AppError(409, ERROR_CODES.BILLING_MANAGED_IN_PORTAL, ERROR_MESSAGES.BILLING_MANAGED_IN_PORTAL);
    }

    const returnUrl = new URL("/business/billing", env.WEB_ORIGIN);
    const session = await gateway.createSubscriptionCheckout({
      priceId: (plan === "PRO" ? env.STRIPE_PRICE_PRO : env.STRIPE_PRICE_STARTER) as string,
      customerId: subscription?.stripeCustomerId ?? null,
      customerEmail: ownerEmail,
      successUrl: `${returnUrl.toString()}?checkout=done`,
      cancelUrl: returnUrl.toString(),
      metadata: { businessId, plan },
    });

    if (!session.url) throw new AppError(502, ERROR_CODES.PAYMENT_PROVIDER_ERROR, ERROR_MESSAGES.PAYMENT_PROVIDER_ERROR);

    return { url: session.url };
  }

  /** Stripe's billing portal, to change plan or card, see invoices or cancel. */
  public async openPortal(businessId: string): Promise<BillingRedirectResponse> {
    const gateway = this.requireGateway();
    const subscription = await subscriptionDal.findForBusiness(businessId);

    if (!subscription?.stripeCustomerId) {
      throw new AppError(409, ERROR_CODES.NO_BILLING_ACCOUNT, ERROR_MESSAGES.NO_BILLING_ACCOUNT);
    }

    return {
      url: await gateway.createBillingPortalSession(subscription.stripeCustomerId, new URL("/business/billing", env.WEB_ORIGIN).toString()),
    };
  }

  /** Whether a Stripe event is about BookWise's own subscriptions rather than customers' payments. */
  public handles(event: StripeEventLike): boolean {
    return (
      SUBSCRIPTION_EVENTS.has(event.type) ||
      (event.type === "checkout.session.completed" && text(event.data.object, "mode") === "subscription")
    );
  }

  /** Keeps the business's plan in step with Stripe. Safe to repeat. */
  public async applyStripeEvent(event: StripeEventLike): Promise<void> {
    const object = event.data.object;

    if (event.type === "checkout.session.completed") {
      await this.onCheckoutCompleted(object);
      return;
    }

    const stripeSubscriptionId = text(object, "id");
    const metadata = (object.metadata ?? {}) as Record<string, unknown>;
    const customerId = text(object, "customer");
    const known =
      (stripeSubscriptionId ? await subscriptionDal.findByStripeSubscription(stripeSubscriptionId) : null) ??
      (customerId ? await subscriptionDal.findByStripeCustomer(customerId) : null);
    const businessId = known?.businessId ?? (typeof metadata.businessId === "string" ? metadata.businessId : null);

    if (!stripeSubscriptionId || !businessId) {
      logger.warn({ type: event.type, stripeSubscriptionId }, "Ignored a subscription event for no known business");
      return;
    }

    const item = ((object.items as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [])[0] ?? {};
    const price = (item.price ?? {}) as Record<string, unknown>;
    const plan = planForPrice(text(price, "id")) ?? known?.plan ?? "FREE";
    // Newer API versions put the period on the item.
    const periodEnd = typeof object.current_period_end === "number" ? object.current_period_end : item.current_period_end;

    await subscriptionDal.save(businessId, {
      plan,
      status: event.type === "customer.subscription.deleted" ? "canceled" : (text(object, "status") ?? "active"),
      stripeCustomerId: customerId,
      stripeSubscriptionId,
      currentPeriodEnd: typeof periodEnd === "number" ? new Date(periodEnd * 1_000) : null,
      cancelAtPeriodEnd: object.cancel_at_period_end === true,
      grantedById: null,
    });
  }

  /** A platform admin puts a business on a plan for free; FREE takes a granted plan away. */
  public async grantPlan(adminId: string, businessId: string, plan: PlanId): Promise<void> {
    const subscription = await subscriptionDal.findForBusiness(businessId);

    if (hasLiveStripeSubscription(subscription)) {
      throw new AppError(409, ERROR_CODES.BILLING_MANAGED_IN_PORTAL, "This business pays for its plan through Stripe; change it there");
    }

    if (plan === "FREE") {
      await subscriptionDal.remove(businessId);
    } else {
      await subscriptionDal.save(businessId, {
        plan,
        status: COMPLIMENTARY_STATUS,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        grantedById: adminId,
      });
    }

    await adminAuditDal.record({ adminId, action: "business.plan", targetType: "business", targetId: businessId, details: { plan } });
  }

  /** The first thing Stripe says after Checkout; the subscription's own events carry its status. */
  private async onCheckoutCompleted(object: Record<string, unknown>): Promise<void> {
    const metadata = (object.metadata ?? {}) as Record<string, unknown>;
    const businessId = text(object, "client_reference_id") ?? (typeof metadata.businessId === "string" ? metadata.businessId : null);
    const stripeSubscriptionId = text(object, "subscription");
    const plan = PLAN_IDS.find((id) => id === metadata.plan) ?? null;

    if (!businessId || !stripeSubscriptionId || !plan) return;

    const known = await subscriptionDal.findByStripeSubscription(stripeSubscriptionId);

    // The subscription's events may have come first; they know its real status.
    if (known) return;

    await subscriptionDal.save(businessId, {
      plan,
      status: "active",
      stripeCustomerId: text(object, "customer"),
      stripeSubscriptionId,
      grantedById: null,
    });
  }

  private requireGateway(): BillingGateway {
    const gateway = billingEnabled() ? this.gatewayFactory() : null;

    if (!gateway) throw new AppError(503, ERROR_CODES.BILLING_NOT_CONFIGURED, ERROR_MESSAGES.BILLING_NOT_CONFIGURED);

    return gateway;
  }
}

function createBillingGateway(): BillingGateway | null {
  return env.STRIPE_SECRET_KEY ? new StripeClient(env.STRIPE_SECRET_KEY) : null;
}

export const subscriptionService = new SubscriptionService();
