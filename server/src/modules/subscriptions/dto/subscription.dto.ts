export type PlanId = "FREE" | "STARTER" | "PRO";

export interface PlanLimits {
  /** Active providers. */
  staffSeats: number;
  /** New chats with the assistant per month, on any channel. */
  aiConversations: number;
  /** SMS and WhatsApp messages sent per month. */
  textMessages: number;
}

export interface PlanResponse {
  id: PlanId;
  name: string;
  priceMonthlyUsd: number;
  limits: PlanLimits;
}

export interface BillingResponse {
  /** False when plans aren't set up on this server; then nothing is limited. */
  enabled: boolean;
  plan: PlanResponse;
  /** free, a Stripe subscription, or granted by BookWise. */
  source: "free" | "stripe" | "complimentary";
  /** Stripe's status for a subscription (active, past_due…); null on the free plan. */
  status: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** True when the owner can change plan, card or cancel in Stripe's portal. */
  canManageInPortal: boolean;
  /** This month so far (UTC), and active providers now. */
  usage: PlanLimits;
  plans: PlanResponse[];
}

export interface StartCheckoutRequest {
  plan: "STARTER" | "PRO";
}

export interface BillingRedirectResponse {
  /** Stripe's page to send the owner to. */
  url: string;
}

export interface GrantPlanRequest {
  /** FREE removes a complimentary plan. */
  plan: PlanId;
}

export interface SubscriptionRecord {
  id: string;
  businessId: string;
  plan: PlanId;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface SubscriptionUpsert {
  plan: PlanId;
  status: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  grantedById?: string | null;
}
