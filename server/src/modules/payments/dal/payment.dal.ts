import { prisma, type DbClient } from "../../../infrastructure/database/prisma.js";
import { isUniqueConstraintError } from "../../../utils/database.js";
import type {
  BookingPaymentRecord,
  CreatePaymentData,
  PaymentAccountRecord,
  PaymentStatus,
  ServicePaymentMode,
} from "../dto/payment.dto.js";

export const paymentSelect = {
  id: true,
  businessId: true,
  bookingId: true,
  kind: true,
  status: true,
  amountMinor: true,
  currency: true,
  refundedMinor: true,
  stripeAccountId: true,
  checkoutSessionId: true,
  checkoutUrl: true,
  checkoutExpiresAt: true,
  paymentIntentId: true,
  paidAt: true,
  createdAt: true,
} as const;

const accountSelect = {
  id: true,
  businessId: true,
  stripeAccountId: true,
  chargesEnabled: true,
  payoutsEnabled: true,
  detailsSubmitted: true,
} as const;

export class PaymentDal {
  public findAccount(businessId: string, client: DbClient = prisma): Promise<PaymentAccountRecord | null> {
    return client.paymentAccount.findFirst({ where: { businessId }, select: accountSelect });
  }

  public async createAccount(businessId: string, stripeAccountId: string): Promise<PaymentAccountRecord> {
    return prisma.paymentAccount.create({ data: { businessId, stripeAccountId }, select: accountSelect });
  }

  public async updateAccountFlags(
    stripeAccountId: string,
    flags: { chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean },
  ): Promise<void> {
    await prisma.paymentAccount.updateMany({ where: { stripeAccountId }, data: flags });
  }

  /** The service's payment mode and deposit, read inside the booking transaction. */
  public async findServicePayment(
    client: DbClient,
    businessId: string,
    serviceId: string,
  ): Promise<{ paymentMode: ServicePaymentMode; depositMinor: number | null } | null> {
    return client.service.findFirst({
      where: { businessId, id: serviceId },
      select: { paymentMode: true, depositMinor: true },
    });
  }

  public createPayment(data: CreatePaymentData): Promise<BookingPaymentRecord> {
    return prisma.payment.create({ data, select: paymentSelect });
  }

  public listForBooking(businessId: string, bookingId: string, take: number): Promise<BookingPaymentRecord[]> {
    return prisma.payment.findMany({
      where: { businessId, bookingId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: paymentSelect,
    });
  }

  public findByCheckoutSession(checkoutSessionId: string): Promise<BookingPaymentRecord | null> {
    return prisma.payment.findFirst({ where: { checkoutSessionId }, select: paymentSelect });
  }

  public findByPaymentIntent(paymentIntentId: string): Promise<BookingPaymentRecord | null> {
    return prisma.payment.findFirst({ where: { paymentIntentId }, select: paymentSelect });
  }

  /** Moves a payment on, but only from the statuses it may leave, so late or repeated events do nothing. */
  public async setStatus(
    payment: BookingPaymentRecord,
    status: PaymentStatus,
    from: readonly PaymentStatus[],
    extra: { paymentIntentId?: string | null; paidAt?: Date } = {},
  ): Promise<boolean> {
    const { count } = await prisma.payment.updateMany({
      where: { businessId: payment.businessId, id: payment.id, status: { in: [...from] } },
      data: { status, ...extra },
    });

    return count > 0;
  }

  /** Records the total refunded so far, as Stripe reports it. */
  public async setRefunded(payment: BookingPaymentRecord, refundedMinor: number): Promise<void> {
    const refunded = Math.min(refundedMinor, payment.amountMinor);

    await prisma.payment.updateMany({
      where: { businessId: payment.businessId, id: payment.id, refundedMinor: { lt: refunded } },
      data: { refundedMinor: refunded, status: refunded >= payment.amountMinor ? "REFUNDED" : "PARTIALLY_REFUNDED" },
    });
  }

  /** Extends an unpaid booking's hold so Checkout can stay open for Stripe's minimum 30 minutes. */
  public async extendPaymentHold(businessId: string, bookingId: string, until: Date): Promise<void> {
    await prisma.booking.updateMany({
      where: { businessId, id: bookingId, status: "PENDING_PAYMENT", holdExpiresAt: { lt: until } },
      data: { holdExpiresAt: until },
    });
  }

  /** Claims a webhook event; false when it was handled before. */
  public async claimWebhookEvent(id: string, type: string): Promise<boolean> {
    try {
      await prisma.stripeWebhookEvent.create({ data: { id, type } });

      return true;
    } catch (error) {
      if (isUniqueConstraintError(error)) return false;
      throw error;
    }
  }

  /** Lets Stripe's retry run again after handling failed. */
  public async releaseWebhookEvent(id: string): Promise<void> {
    await prisma.stripeWebhookEvent.deleteMany({ where: { id } });
  }
}

export const paymentDal = new PaymentDal();
