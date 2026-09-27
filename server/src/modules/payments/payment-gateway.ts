import { env } from "../../config/env.js";
import { StripeClient, type PaymentGateway } from "../../integrations/stripe/stripe.client.js";

/** Online payments need the Stripe key and a webhook secret to learn how payments end. */
export function paymentsEnabled(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

export function createPaymentGateway(): PaymentGateway | null {
  return env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET ? new StripeClient(env.STRIPE_SECRET_KEY) : null;
}

/** The webhook signing secrets, as configured (comma-separated). */
export function stripeWebhookSecrets(): string[] {
  return (env.STRIPE_WEBHOOK_SECRET ?? "")
    .split(",")
    .map((secret) => secret.trim())
    .filter(Boolean);
}
