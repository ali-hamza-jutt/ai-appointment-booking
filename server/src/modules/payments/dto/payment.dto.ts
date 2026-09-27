export type ServicePaymentMode = "NONE" | "DEPOSIT" | "FULL";

export type PaymentKind = "DEPOSIT" | "FULL";

export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "PARTIALLY_REFUNDED" | "REFUNDED";

/** A booking's latest payment, as customers and staff see it. */
export interface BookingPaymentSummary {
  id: string;
  kind: PaymentKind;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  refundedMinor: number;
  /** Where to pay, while Checkout is open for a booking waiting on payment. */
  checkoutUrl: string | null;
  checkoutExpiresAt: Date;
  paidAt: Date | null;
}

export interface BookingPaymentListResponse {
  items: BookingPaymentSummary[];
}

export interface RefundBookingRequest {
  /** Leave out to refund everything not yet refunded. @isInt @minimum 1 */
  amountMinor?: number;
}

export interface PaymentAccountResponse {
  /** Online payments are set up on this BookWise deployment. */
  available: boolean;
  /** The business has started connecting a Stripe account. */
  connected: boolean;
  /** Stripe accepts card payments for the business; only then are deposits asked for. */
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export interface PaymentLinkResponse {
  url: string;
}

export interface BookingPaymentRecord {
  id: string;
  businessId: string;
  bookingId: string;
  kind: PaymentKind;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  refundedMinor: number;
  stripeAccountId: string;
  checkoutSessionId: string;
  checkoutUrl: string | null;
  checkoutExpiresAt: Date;
  paymentIntentId: string | null;
  paidAt: Date | null;
  createdAt: Date;
}

export interface PaymentAccountRecord {
  id: string;
  businessId: string;
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

/** What confirming a booking would ask the customer to pay, if anything. */
export interface PaymentRequirement {
  kind: PaymentKind;
  amountMinor: number;
  stripeAccountId: string;
  /** The deposit set on the service, kept on a late cancellation. */
  depositMinor: number | null;
}

export interface CreatePaymentData {
  businessId: string;
  bookingId: string;
  kind: PaymentKind;
  amountMinor: number;
  currency: string;
  stripeAccountId: string;
  checkoutSessionId: string;
  checkoutUrl: string | null;
  checkoutExpiresAt: Date;
}

/** The parts of a Stripe event BookWise reads. */
export interface StripeEvent {
  id: string;
  type: string;
  account?: string;
  data: { object: Record<string, unknown> };
}
