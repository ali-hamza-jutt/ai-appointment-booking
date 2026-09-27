import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  PAYMENT_CONSTANTS,
  VALIDATION_PATTERNS,
} from "../../constants/app.constants.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { StripeApiError, type PaymentGateway } from "../../integrations/stripe/stripe.client.js";
import { AppError } from "../../middleware/app-error.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { resolveBookingPolicy } from "../bookings/booking-policy.js";
import { bookingService } from "../bookings/booking.service.js";
import type { AppointmentResponse, BookingRecord } from "../bookings/dto/booking.dto.js";
import type { OutboxMessage } from "../outbox/dto/outbox.dto.js";
import { paymentDal } from "./dal/payment.dal.js";
import type {
  BookingPaymentListResponse,
  BookingPaymentRecord,
  BookingPaymentSummary,
  PaymentStatus,
  RefundBookingRequest,
  StripeEvent,
} from "./dto/payment.dto.js";
import { createPaymentGateway } from "./payment-gateway.js";
import { cancellationRefund, platformFee } from "./payment-rules.js";

const MINUTE = 60_000;
const PAID: readonly PaymentStatus[] = ["SUCCEEDED", "PARTIALLY_REFUNDED"];

function stringField(object: Record<string, unknown>, key: string): string | null {
  const value = object[key];

  return typeof value === "string" ? value : null;
}

function returnUrl(bookingId: string, result: "success" | "cancelled"): string {
  const url = new URL(`${PAYMENT_CONSTANTS.RETURN_PATH}/${bookingId}`, env.WEB_ORIGIN);

  url.searchParams.set("payment", result);

  return url.toString();
}

/**
 * Deposits and prepayments through Stripe Checkout. Confirming a booking
 * that needs payment opens Checkout; Stripe's webhook then confirms it, and
 * cancellations are refunded by the cancellation policy.
 */
export class PaymentService {
  public constructor(private readonly gateway: PaymentGateway | null = createPaymentGateway()) {}

  /**
   * Confirms the customer's hold and, when the service asks for payment,
   * opens Checkout. The response carries the link to pay.
   */
  public async confirmForCustomer(userId: string, bookingId: string): Promise<AppointmentResponse> {
    const booking = await bookingService.confirmOwnHold(userId, bookingId);

    return bookingService.toAppointmentResponse(await this.withCheckout(booking));
  }

  /** Opens Checkout again for a booking still waiting on payment, for example after the tab was closed. */
  public async resumeForCustomer(userId: string, bookingId: string): Promise<AppointmentResponse> {
    const booking = await bookingService.getOwnedRecord(userId, bookingId);

    if (booking.status !== "PENDING_PAYMENT") {
      throw new AppError(409, ERROR_CODES.PAYMENT_NOT_REQUIRED, ERROR_MESSAGES.PAYMENT_NOT_REQUIRED);
    }

    return bookingService.toAppointmentResponse(await this.withCheckout(booking));
  }

  /**
   * Makes sure a booking waiting on payment has an open Checkout session,
   * reusing the current one while it has time left. Returns the booking as
   * it now is.
   */
  public async withCheckout(booking: BookingRecord, now: Date = new Date()): Promise<BookingRecord> {
    if (booking.status !== "PENDING_PAYMENT") return booking;

    const latest = booking.payments[0];

    if (latest?.status === "PENDING" && latest.checkoutUrl && latest.checkoutExpiresAt.getTime() > now.getTime() + MINUTE) {
      return booking;
    }

    const requirement = await bookingService.paymentRequirement(booking);

    if (!requirement || !this.gateway) {
      throw new AppError(503, ERROR_CODES.PAYMENTS_NOT_CONFIGURED, ERROR_MESSAGES.PAYMENTS_NOT_CONFIGURED);
    }

    // Stripe keeps Checkout open for at least 30 minutes, so the hold is stretched to match if needed.
    const minimumExpiry = new Date(now.getTime() + PAYMENT_CONSTANTS.MIN_CHECKOUT_MINUTES * MINUTE);
    const expiresAt =
      booking.holdExpiresAt && booking.holdExpiresAt > minimumExpiry ? booking.holdExpiresAt : minimumExpiry;
    const currency = booking.currency ?? "usd";
    let session;

    try {
      session = await this.gateway.createCheckoutSession(
        requirement.stripeAccountId,
        {
          amountMinor: requirement.amountMinor,
          currency,
          description: `${booking.serviceName} at ${booking.business.name}${requirement.kind === "DEPOSIT" ? " (deposit)" : ""}`,
          customerEmail: booking.customer.email,
          successUrl: returnUrl(booking.id, "success"),
          cancelUrl: returnUrl(booking.id, "cancelled"),
          expiresAt,
          applicationFeeMinor: platformFee(requirement.amountMinor, env.STRIPE_PLATFORM_FEE_PERCENT),
          metadata: { bookingId: booking.id, businessId: booking.businessId },
        },
        // One session per attempt: a retried request reuses it instead of opening another.
        `checkout-${booking.id}-${latest?.id ?? "first"}`,
      );
    } catch (error) {
      logger.warn({ err: error, bookingId: booking.id }, "Opening Stripe Checkout failed");
      throw new AppError(502, ERROR_CODES.PAYMENT_PROVIDER_ERROR, ERROR_MESSAGES.PAYMENT_PROVIDER_ERROR);
    }

    if (session.expiresAt > (booking.holdExpiresAt ?? now)) {
      await paymentDal.extendPaymentHold(booking.businessId, booking.id, session.expiresAt);
    }

    await paymentDal.createPayment({
      businessId: booking.businessId,
      bookingId: booking.id,
      kind: requirement.kind,
      amountMinor: requirement.amountMinor,
      currency: currency.toUpperCase(),
      stripeAccountId: requirement.stripeAccountId,
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
      checkoutExpiresAt: session.expiresAt,
    });

    return (await bookingService.findRecord(booking.businessId, booking.id)) ?? booking;
  }

  /**
   * Applies one verified Stripe event. Each event is handled once; if
   * handling fails it is released so Stripe's retry runs it again.
   */
  public async handleStripeEvent(event: StripeEvent): Promise<void> {
    if (!(await paymentDal.claimWebhookEvent(event.id, event.type))) return;

    try {
      await this.applyStripeEvent(event);
    } catch (error) {
      await paymentDal.releaseWebhookEvent(event.id);
      throw error;
    }
  }

  /** Refunds by policy when a paid booking is cancelled, and closes Checkout on bookings that ended unpaid. */
  public async handleBookingEvent(message: OutboxMessage): Promise<void> {
    const bookingId = message.payload.bookingId;

    if (!message.businessId || typeof bookingId !== "string") return;

    const booking = await bookingService.findRecord(message.businessId, bookingId);

    if (!booking) return;

    for (const payment of await paymentDal.listForBooking(booking.businessId, booking.id, PAYMENT_CONSTANTS.BOOKING_LOG_LIMIT)) {
      if (payment.status === "PENDING") {
        await this.gateway?.expireCheckoutSession(payment.checkoutSessionId);
        await paymentDal.setStatus(payment, "CANCELLED", ["PENDING"]);
      } else if (PAID.includes(payment.status) && message.type === PAYMENT_CONSTANTS.EVENTS.CANCELLED) {
        await this.refundCancelled(booking, payment);
      } else if (PAID.includes(payment.status) && message.type === PAYMENT_CONSTANTS.EVENTS.EXPIRED) {
        // Paid, but the time was lost first: give it all back.
        await this.refund(payment, payment.amountMinor - payment.refundedMinor, "expired");
      }
    }
  }

  /** A refund staff choose to give, all or part of what is left. */
  public async refundForStaff(
    businessId: string,
    bookingId: string,
    request: RefundBookingRequest,
  ): Promise<BookingPaymentSummary> {
    const payments = VALIDATION_PATTERNS.UUID.test(bookingId)
      ? await paymentDal.listForBooking(businessId, bookingId, PAYMENT_CONSTANTS.BOOKING_LOG_LIMIT)
      : [];
    const payment = payments.find((item) => PAID.includes(item.status));
    const refundable = payment ? payment.amountMinor - payment.refundedMinor : 0;

    if (!payment || refundable <= 0) {
      throw new AppError(409, ERROR_CODES.REFUND_NOT_ALLOWED, ERROR_MESSAGES.REFUND_NOT_ALLOWED);
    }

    const amount = request.amountMinor ?? refundable;

    if (!Number.isInteger(amount) || amount < 1 || amount > refundable) {
      throwRequestValidationError("amountMinor", `Refund between 1 and ${refundable}`);
    }

    await this.refund(payment, amount, `manual-${payment.refundedMinor}`);

    const updated = (await paymentDal.listForBooking(businessId, bookingId, 1))[0] ?? payment;

    return this.toSummary(updated);
  }

  public async listForBooking(businessId: string, bookingId: string): Promise<BookingPaymentListResponse> {
    const payments = VALIDATION_PATTERNS.UUID.test(bookingId)
      ? await paymentDal.listForBooking(businessId, bookingId, PAYMENT_CONSTANTS.BOOKING_LOG_LIMIT)
      : [];

    return { items: payments.map((payment) => this.toSummary(payment)) };
  }

  private async applyStripeEvent(event: StripeEvent): Promise<void> {
    const object = event.data.object;

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        // Bank debits and similar complete later; their success arrives as its own event.
        if (stringField(object, "payment_status") === "paid") await this.onPaid(object);
        return;
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const payment = await this.paymentForSession(object);

        if (payment) {
          await paymentDal.setStatus(payment, event.type === "checkout.session.expired" ? "CANCELLED" : "FAILED", ["PENDING"]);
        }
        return;
      }
      case "charge.refunded": {
        const intent = stringField(object, "payment_intent");
        const payment = intent ? await paymentDal.findByPaymentIntent(intent) : null;
        const refunded = object.amount_refunded;

        if (payment && typeof refunded === "number") await paymentDal.setRefunded(payment, refunded);
        return;
      }
      case "account.updated": {
        const accountId = stringField(object, "id");

        if (accountId) {
          await paymentDal.updateAccountFlags(accountId, {
            chargesEnabled: object.charges_enabled === true,
            payoutsEnabled: object.payouts_enabled === true,
            detailsSubmitted: object.details_submitted === true,
          });
        }
        return;
      }
      default:
        return;
    }
  }

  /** Records the payment and confirms the booking, refunding if the booking can no longer be kept. */
  private async onPaid(session: Record<string, unknown>): Promise<void> {
    const payment = await this.paymentForSession(session);

    if (!payment) return;

    const paymentIntentId = stringField(session, "payment_intent");

    await paymentDal.setStatus(payment, "SUCCEEDED", ["PENDING", "CANCELLED", "FAILED"], {
      paymentIntentId,
      paidAt: new Date(),
    });

    const booking = await bookingService.findRecord(payment.businessId, payment.bookingId);
    const outcome = booking ? await bookingService.confirmPaidBooking(booking) : null;

    if (!outcome?.confirmed && paymentIntentId) {
      logger.warn({ bookingId: payment.bookingId }, "Payment arrived for a booking that could not be kept; refunding");
      await this.refund({ ...payment, paymentIntentId }, payment.amountMinor, "unbookable");
    }
  }

  private async refundCancelled(booking: BookingRecord, payment: BookingPaymentRecord): Promise<void> {
    const service = booking.serviceId
      ? await paymentDal.findServicePayment(prisma, booking.businessId, booking.serviceId)
      : null;
    const policy = resolveBookingPolicy(booking.business.settings, booking.service?.policyOverrides);
    const amount = cancellationRefund({
      paidMinor: payment.amountMinor,
      alreadyRefundedMinor: payment.refundedMinor,
      kind: payment.kind,
      depositMinor: service?.depositMinor ?? null,
      cancelledBy: booking.cancelledBy,
      cancelledAt: booking.cancelledAt ?? new Date(),
      scheduledAt: booking.scheduledAt,
      cancellationWindowHours: policy.cancellationWindowHours,
    });

    if (amount > 0) await this.refund(payment, amount, "cancelled");
  }

  /**
   * Refunds through Stripe. The idempotency key makes a retried refund a
   * no-op; a refund Stripe refuses outright (already refunded, for example) is
   * logged and not retried.
   */
  private async refund(payment: BookingPaymentRecord, amountMinor: number, reason: string): Promise<void> {
    if (amountMinor <= 0 || !payment.paymentIntentId) return;

    if (!this.gateway) {
      throw new AppError(503, ERROR_CODES.PAYMENTS_NOT_CONFIGURED, ERROR_MESSAGES.PAYMENTS_NOT_CONFIGURED);
    }

    try {
      const refund = await this.gateway.refund(payment.paymentIntentId, amountMinor, `refund-${payment.id}-${reason}`);

      await paymentDal.setRefunded(payment, payment.refundedMinor + refund.amountMinor);
    } catch (error) {
      if (error instanceof StripeApiError && error.kind === "rejected") {
        logger.error({ err: error, paymentId: payment.id }, "Stripe refused a refund");
        return;
      }

      throw error;
    }
  }

  private paymentForSession(session: Record<string, unknown>): Promise<BookingPaymentRecord | null> {
    const sessionId = stringField(session, "id");

    return sessionId ? paymentDal.findByCheckoutSession(sessionId) : Promise.resolve(null);
  }

  private toSummary(payment: BookingPaymentRecord): BookingPaymentSummary {
    return {
      id: payment.id,
      kind: payment.kind,
      status: payment.status,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      refundedMinor: payment.refundedMinor,
      checkoutUrl: null,
      checkoutExpiresAt: payment.checkoutExpiresAt,
      paidAt: payment.paidAt,
    };
  }
}

export const paymentService = new PaymentService();
