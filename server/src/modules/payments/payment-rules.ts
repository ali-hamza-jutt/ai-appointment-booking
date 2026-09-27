import type { PaymentKind, ServicePaymentMode } from "./dto/payment.dto.js";

/** What the customer pays online for a service, or null when nothing is due. */
export function amountDue(
  mode: ServicePaymentMode,
  priceMinor: number | null,
  depositMinor: number | null,
): { kind: PaymentKind; amountMinor: number } | null {
  if (mode === "FULL" && priceMinor && priceMinor > 0) return { kind: "FULL", amountMinor: priceMinor };
  if (mode === "DEPOSIT" && depositMinor && depositMinor > 0) {
    return { kind: "DEPOSIT", amountMinor: Math.min(depositMinor, priceMinor ?? depositMinor) };
  }

  return null;
}

export interface CancellationRefundInput {
  paidMinor: number;
  alreadyRefundedMinor: number;
  kind: PaymentKind;
  /** The service's deposit; kept on a late cancellation of a fully paid booking. */
  depositMinor: number | null;
  cancelledBy: "CUSTOMER" | "STAFF" | "SYSTEM" | null;
  cancelledAt: Date;
  scheduledAt: Date;
  cancellationWindowHours: number;
}

/**
 * How much to give back when a paid booking is cancelled. The business
 * cancelling refunds everything. A customer cancelling before the
 * cancellation window gets everything back; inside it, the deposit is kept.
 */
export function cancellationRefund(input: CancellationRefundInput): number {
  const remaining = Math.max(0, input.paidMinor - input.alreadyRefundedMinor);

  if (input.cancelledBy !== "CUSTOMER") return remaining;

  const windowStarts = input.scheduledAt.getTime() - input.cancellationWindowHours * 3_600_000;

  if (input.cancelledAt.getTime() <= windowStarts) return remaining;

  const kept = input.kind === "DEPOSIT" ? input.paidMinor : Math.min(input.depositMinor ?? 0, input.paidMinor);

  return Math.max(0, input.paidMinor - kept - input.alreadyRefundedMinor);
}

/** BookWise's cut of a payment, rounded down to whole minor units. */
export function platformFee(amountMinor: number, percent: number): number {
  return Math.floor((amountMinor * percent) / 100);
}
