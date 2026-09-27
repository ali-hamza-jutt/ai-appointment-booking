import { PAYMENT_CONSTANTS } from "../../constants/app.constants.js";

/** transient: worth retrying. rejected: Stripe refused the request itself. */
export class StripeApiError extends Error {
  public constructor(
    message: string,
    public readonly kind: "transient" | "rejected",
    public readonly status: number | null = null,
    public readonly code: string | null = null,
  ) {
    super(message);
    this.name = "StripeApiError";
  }
}

type FormValue = string | number | boolean | null | undefined | FormObject | FormValue[];

interface FormObject {
  [key: string]: FormValue;
}

/** Stripe's form encoding: nested objects and arrays as a[b][0][c]=value. */
export function encodeStripeForm(value: FormObject): string {
  const params = new URLSearchParams();
  const add = (key: string, item: FormValue): void => {
    if (item === null || item === undefined) return;
    if (Array.isArray(item)) {
      item.forEach((entry, index) => add(`${key}[${index}]`, entry));
    } else if (typeof item === "object") {
      for (const [child, entry] of Object.entries(item)) add(`${key}[${child}]`, entry);
    } else {
      params.append(key, String(item));
    }
  };

  for (const [key, item] of Object.entries(value)) add(key, item);

  return params.toString();
}

export interface StripeAccount {
  id: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export interface StripeCheckoutSession {
  id: string;
  url: string | null;
  expiresAt: Date;
}

export interface CheckoutRequest {
  amountMinor: number;
  currency: string;
  /** What the customer sees on the Checkout page. */
  description: string;
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
  applicationFeeMinor: number;
  metadata: Record<string, string>;
}

/** The Stripe calls BookWise makes; the webhook tells us the outcomes. */
export interface PaymentGateway {
  createAccount(input: { email: string | null; businessName: string }): Promise<StripeAccount>;
  retrieveAccount(accountId: string): Promise<StripeAccount>;
  createOnboardingLink(accountId: string, urls: { refreshUrl: string; returnUrl: string }): Promise<string>;
  createDashboardLink(accountId: string): Promise<string>;
  /** A Checkout session whose payment is passed on to the business's account. */
  createCheckoutSession(accountId: string, request: CheckoutRequest, idempotencyKey: string): Promise<StripeCheckoutSession>;
  /** Closes an open session so it can no longer be paid; one already closed is fine. */
  expireCheckoutSession(sessionId: string): Promise<void>;
  /** Refunds the customer and takes the amount back from the business's account. */
  refund(paymentIntentId: string, amountMinor: number, idempotencyKey: string): Promise<{ amountMinor: number }>;
}

interface RawAccount {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
}

function toAccount(raw: RawAccount): StripeAccount {
  return {
    id: raw.id,
    chargesEnabled: raw.charges_enabled === true,
    payoutsEnabled: raw.payouts_enabled === true,
    detailsSubmitted: raw.details_submitted === true,
  };
}

/**
 * Stripe's REST API with the platform key. Payments are destination charges:
 * created on the platform, paid out to the business's Express account, with
 * the business as merchant of record (on_behalf_of).
 */
export class StripeClient implements PaymentGateway {
  public constructor(private readonly secretKey: string) {}

  public async createAccount(input: { email: string | null; businessName: string }): Promise<StripeAccount> {
    return toAccount(
      await this.request<RawAccount>("POST", "/accounts", {
        form: {
          type: "express",
          ...(input.email ? { email: input.email } : {}),
          business_profile: { name: input.businessName },
          capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        },
      }),
    );
  }

  public async retrieveAccount(accountId: string): Promise<StripeAccount> {
    return toAccount(await this.request<RawAccount>("GET", `/accounts/${encodeURIComponent(accountId)}`));
  }

  public async createOnboardingLink(accountId: string, urls: { refreshUrl: string; returnUrl: string }): Promise<string> {
    const link = await this.request<{ url: string }>("POST", "/account_links", {
      form: { account: accountId, refresh_url: urls.refreshUrl, return_url: urls.returnUrl, type: "account_onboarding" },
    });

    return link.url;
  }

  public async createDashboardLink(accountId: string): Promise<string> {
    const link = await this.request<{ url: string }>("POST", `/accounts/${encodeURIComponent(accountId)}/login_links`);

    return link.url;
  }

  public async createCheckoutSession(
    accountId: string,
    request: CheckoutRequest,
    idempotencyKey: string,
  ): Promise<StripeCheckoutSession> {
    const session = await this.request<{ id: string; url: string | null; expires_at: number }>("POST", "/checkout/sessions", {
      idempotencyKey,
      form: {
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: request.currency.toLowerCase(),
              unit_amount: request.amountMinor,
              product_data: { name: request.description },
            },
          },
        ],
        ...(request.customerEmail ? { customer_email: request.customerEmail } : {}),
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        expires_at: Math.floor(request.expiresAt.getTime() / 1_000),
        client_reference_id: request.metadata.bookingId,
        metadata: request.metadata,
        payment_intent_data: {
          metadata: request.metadata,
          on_behalf_of: accountId,
          transfer_data: { destination: accountId },
          ...(request.applicationFeeMinor > 0 ? { application_fee_amount: request.applicationFeeMinor } : {}),
        },
      },
    });

    return { id: session.id, url: session.url, expiresAt: new Date(session.expires_at * 1_000) };
  }

  public async expireCheckoutSession(sessionId: string): Promise<void> {
    await this.request("POST", `/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, {
      // Already paid or expired sessions answer 400; either way nothing is left to close.
      allow: [400, 404],
    });
  }

  public async refund(paymentIntentId: string, amountMinor: number, idempotencyKey: string): Promise<{ amountMinor: number }> {
    const refund = await this.request<{ amount: number }>("POST", "/refunds", {
      idempotencyKey,
      form: {
        payment_intent: paymentIntentId,
        amount: amountMinor,
        reverse_transfer: true,
        refund_application_fee: true,
      },
    });

    return { amountMinor: refund.amount };
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    options: { form?: FormObject; idempotencyKey?: string; allow?: number[] } = {},
  ): Promise<T> {
    let response: Response;

    try {
      response = await fetch(`${PAYMENT_CONSTANTS.API_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          ...(options.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
          ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
        },
        ...(options.form ? { body: encodeStripeForm(options.form) } : {}),
        signal: AbortSignal.timeout(PAYMENT_CONSTANTS.REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new StripeApiError(
        `Stripe request failed: ${error instanceof Error ? error.message : "network error"}`,
        "transient",
      );
    }

    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };

    if (response.ok || options.allow?.includes(response.status)) return body as T;

    throw new StripeApiError(
      `Stripe returned ${response.status}${body.error?.message ? `: ${body.error.message}` : ""}`,
      response.status === 429 || response.status >= 500 ? "transient" : "rejected",
      response.status,
      body.error?.code ?? null,
    );
  }
}
