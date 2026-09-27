import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { ERROR_CODES, ERROR_MESSAGES, PAYMENT_CONSTANTS } from "../../constants/app.constants.js";
import type { PaymentGateway } from "../../integrations/stripe/stripe.client.js";
import { AppError } from "../../middleware/app-error.js";
import { businessService } from "../businesses/business.service.js";
import { paymentDal } from "./dal/payment.dal.js";
import type { PaymentAccountRecord, PaymentAccountResponse, PaymentLinkResponse } from "./dto/payment.dto.js";
import { createPaymentGateway } from "./payment-gateway.js";

function settingsUrl(result: "return" | "refresh"): string {
  const url = new URL(PAYMENT_CONSTANTS.SETTINGS_PATH, env.WEB_ORIGIN);

  url.searchParams.set("stripe", result);

  return url.toString();
}

/** Connecting a business to Stripe (an Express account) so it can take deposits. */
export class PaymentAccountService {
  public constructor(private readonly gateway: PaymentGateway | null = createPaymentGateway()) {}

  public async getAccount(businessId: string): Promise<PaymentAccountResponse> {
    return this.toResponse(await paymentDal.findAccount(businessId));
  }

  /**
   * Stripe's onboarding page for the business, creating its account on first
   * use. Owners come back to the payments settings page when done.
   */
  public async startOnboarding(businessId: string, ownerEmail: string): Promise<PaymentLinkResponse> {
    const gateway = this.requireGateway();
    let account = await paymentDal.findAccount(businessId);

    if (!account) {
      const business = await businessService.getBusiness(businessId, null);
      const created = await this.call(() => gateway.createAccount({ email: ownerEmail, businessName: business.name }));

      account = await paymentDal.createAccount(businessId, created.id);
    }

    const stripeAccountId = account.stripeAccountId;
    const url = await this.call(() =>
      gateway.createOnboardingLink(stripeAccountId, { refreshUrl: settingsUrl("refresh"), returnUrl: settingsUrl("return") }),
    );

    return { url };
  }

  /** Reads the account's status from Stripe, for when an owner returns from onboarding. */
  public async refreshAccount(businessId: string): Promise<PaymentAccountResponse> {
    const gateway = this.requireGateway();
    const account = await paymentDal.findAccount(businessId);

    if (!account) return this.toResponse(null);

    const latest = await this.call(() => gateway.retrieveAccount(account.stripeAccountId));

    await paymentDal.updateAccountFlags(account.stripeAccountId, {
      chargesEnabled: latest.chargesEnabled,
      payoutsEnabled: latest.payoutsEnabled,
      detailsSubmitted: latest.detailsSubmitted,
    });

    return this.toResponse(latest);
  }

  /** A one-time link to the business's Stripe Express dashboard (payouts, disputes). */
  public async dashboardLink(businessId: string): Promise<PaymentLinkResponse> {
    const gateway = this.requireGateway();
    const account = await paymentDal.findAccount(businessId);

    if (!account) throw new AppError(409, ERROR_CODES.PAYMENTS_NOT_CONFIGURED, "Connect a Stripe account first");

    return { url: await this.call(() => gateway.createDashboardLink(account.stripeAccountId)) };
  }

  private requireGateway(): PaymentGateway {
    if (!this.gateway) {
      throw new AppError(503, ERROR_CODES.PAYMENTS_NOT_CONFIGURED, ERROR_MESSAGES.PAYMENTS_NOT_CONFIGURED);
    }

    return this.gateway;
  }

  private async call<Result>(work: () => Promise<Result>): Promise<Result> {
    try {
      return await work();
    } catch (error) {
      logger.warn({ err: error }, "Stripe account request failed");
      throw new AppError(502, ERROR_CODES.PAYMENT_PROVIDER_ERROR, ERROR_MESSAGES.PAYMENT_PROVIDER_ERROR);
    }
  }

  private toResponse(account: Pick<PaymentAccountRecord, "chargesEnabled" | "payoutsEnabled" | "detailsSubmitted"> | null): PaymentAccountResponse {
    return {
      available: this.gateway !== null,
      connected: account !== null,
      chargesEnabled: account?.chargesEnabled ?? false,
      payoutsEnabled: account?.payoutsEnabled ?? false,
      detailsSubmitted: account?.detailsSubmitted ?? false,
    };
  }
}

export const paymentAccountService = new PaymentAccountService();
