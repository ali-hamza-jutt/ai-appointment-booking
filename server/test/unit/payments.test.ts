import { afterEach, describe, expect, it, vi } from "vitest";

import { isValidStripeSignature, stripeSignatureHeader } from "../../src/integrations/stripe/stripe-signature.js";
import { encodeStripeForm, StripeClient } from "../../src/integrations/stripe/stripe.client.js";
import { amountDue, cancellationRefund, noShowRefund, platformFee } from "../../src/modules/payments/payment-rules.js";

const start = new Date("2026-10-10T10:00:00Z");
const base = {
  paidMinor: 5_000,
  alreadyRefundedMinor: 0,
  kind: "FULL" as const,
  depositMinor: 1_000,
  cancelledBy: "CUSTOMER" as const,
  scheduledAt: start,
  cancellationWindowHours: 24,
};

describe("amountDue", () => {
  it("asks for the deposit, the full price or nothing", () => {
    expect(amountDue("DEPOSIT", 5_000, 1_000)).toEqual({ kind: "DEPOSIT", amountMinor: 1_000 });
    expect(amountDue("FULL", 5_000, 1_000)).toEqual({ kind: "FULL", amountMinor: 5_000 });
    expect(amountDue("NONE", 5_000, 1_000)).toBeNull();
    expect(amountDue("DEPOSIT", 5_000, null)).toBeNull();
    expect(amountDue("FULL", 0, null)).toBeNull();
    // A deposit never exceeds what the booking costs.
    expect(amountDue("DEPOSIT", 800, 1_000)).toEqual({ kind: "DEPOSIT", amountMinor: 800 });
  });
});

describe("cancellationRefund", () => {
  it("refunds everything when the business cancels", () => {
    expect(cancellationRefund({ ...base, cancelledBy: "STAFF", cancelledAt: new Date("2026-10-10T09:00:00Z") })).toBe(5_000);
  });

  it("refunds everything when the customer cancels before the window", () => {
    expect(cancellationRefund({ ...base, cancelledAt: new Date("2026-10-09T09:59:00Z") })).toBe(5_000);
  });

  it("keeps the deposit when the customer cancels inside the window", () => {
    const late = new Date("2026-10-09T12:00:00Z");

    expect(cancellationRefund({ ...base, cancelledAt: late })).toBe(4_000);
    expect(cancellationRefund({ ...base, kind: "DEPOSIT", paidMinor: 1_000, cancelledAt: late })).toBe(0);
    expect(cancellationRefund({ ...base, depositMinor: null, cancelledAt: late })).toBe(5_000);
  });

  it("never refunds more than is left", () => {
    expect(
      cancellationRefund({ ...base, alreadyRefundedMinor: 4_500, cancelledBy: "STAFF", cancelledAt: start }),
    ).toBe(500);
    expect(cancellationRefund({ ...base, alreadyRefundedMinor: 4_500, cancelledAt: new Date("2026-10-09T12:00:00Z") })).toBe(0);
  });
});

describe("noShowRefund", () => {
  const prepaid = { paidMinor: 5_000, alreadyRefundedMinor: 0, kind: "FULL" as const, depositMinor: 1_000 };

  it("keeps everything by default, only the deposit, or nothing, as the business chose", () => {
    expect(noShowRefund({ ...prepaid, fee: "payment" })).toBe(0);
    expect(noShowRefund({ ...prepaid, fee: "deposit" })).toBe(4_000);
    expect(noShowRefund({ ...prepaid, fee: "none" })).toBe(5_000);
  });

  it("keeps a paid deposit whole, and never refunds twice", () => {
    expect(noShowRefund({ ...prepaid, kind: "DEPOSIT", paidMinor: 1_000, fee: "deposit" })).toBe(0);
    expect(noShowRefund({ ...prepaid, depositMinor: null, fee: "deposit" })).toBe(5_000);
    expect(noShowRefund({ ...prepaid, alreadyRefundedMinor: 4_500, fee: "none" })).toBe(500);
  });
});

describe("platformFee", () => {
  it("rounds down to whole minor units", () => {
    expect(platformFee(1_999, 2.5)).toBe(49);
    expect(platformFee(1_000, 0)).toBe(0);
  });
});

describe("Stripe webhook signatures", () => {
  const payload = JSON.stringify({ id: "evt_1", type: "account.updated" });
  const now = 1_790_000_000;

  it("accepts a fresh, correctly signed payload", () => {
    expect(isValidStripeSignature(payload, stripeSignatureHeader(payload, "whsec_a", now), "whsec_a", now + 10, 300)).toBe(true);
  });

  it("refuses another secret, a changed body, a replay and a missing header", () => {
    const header = stripeSignatureHeader(payload, "whsec_a", now);

    expect(isValidStripeSignature(payload, header, "whsec_b", now, 300)).toBe(false);
    expect(isValidStripeSignature(`${payload} `, header, "whsec_a", now, 300)).toBe(false);
    expect(isValidStripeSignature(payload, header, "whsec_a", now + 301, 300)).toBe(false);
    expect(isValidStripeSignature(payload, undefined, "whsec_a", now, 300)).toBe(false);
  });

  it("accepts any of several v1 signatures, as during secret rotation", () => {
    const signed = stripeSignatureHeader(payload, "whsec_new", now);

    expect(isValidStripeSignature(payload, `${signed},v1=deadbeef`, "whsec_new", now, 300)).toBe(true);
  });
});

describe("Stripe client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("encodes nested parameters the way Stripe expects", () => {
    expect(decodeURIComponent(encodeStripeForm({ a: 1, b: { c: [{ d: "x" }], e: null }, f: true }))).toBe(
      "a=1&b[c][0][d]=x&f=true",
    );
  });

  it("opens Checkout as a destination charge to the business's account", async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        calls.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });

        return Promise.resolve(
          new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.com/c/cs_1", expires_at: 1_790_001_800 }), {
            status: 200,
          }),
        );
      }),
    );

    const session = await new StripeClient("sk_test").createCheckoutSession(
      "acct_123",
      {
        amountMinor: 1_000,
        currency: "GBP",
        description: "Haircut at Glow Salon (deposit)",
        customerEmail: "ayesha@example.com",
        successUrl: "https://app/appointments/b1?payment=success",
        cancelUrl: "https://app/appointments/b1?payment=cancelled",
        expiresAt: new Date(1_790_001_800_000),
        applicationFeeMinor: 25,
        metadata: { bookingId: "b1", businessId: "biz1" },
      },
      "checkout-b1-first",
    );
    const params = new URLSearchParams(calls[0]?.body);

    expect(session).toEqual({ id: "cs_1", url: "https://checkout.stripe.com/c/cs_1", expiresAt: new Date(1_790_001_800_000) });
    expect(calls[0]?.url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(calls[0]?.headers).toMatchObject({ Authorization: "Bearer sk_test", "Idempotency-Key": "checkout-b1-first" });
    expect(calls[0]?.headers).not.toHaveProperty("Stripe-Account");
    expect(Object.fromEntries(params)).toMatchObject({
      mode: "payment",
      "line_items[0][price_data][currency]": "gbp",
      "line_items[0][price_data][unit_amount]": "1000",
      "payment_intent_data[transfer_data][destination]": "acct_123",
      "payment_intent_data[on_behalf_of]": "acct_123",
      "payment_intent_data[application_fee_amount]": "25",
      "metadata[bookingId]": "b1",
      client_reference_id: "b1",
      expires_at: "1790001800",
    });
  });

  it("reports Stripe's refusals and outages differently", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: { message: "No such payment_intent", code: "resource_missing" } }), { status: 400 }))),
    );

    await expect(new StripeClient("sk_test").refund("pi_x", 100, "k")).rejects.toMatchObject({
      kind: "rejected",
      code: "resource_missing",
    });

    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}", { status: 503 }))));

    await expect(new StripeClient("sk_test").refund("pi_x", 100, "k")).rejects.toMatchObject({ kind: "transient" });
  });
});
