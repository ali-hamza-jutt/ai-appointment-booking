import type { BookingResponse } from "@/generated/api/models";
import { formatMoney } from "@/lib/utils/money";

export function formatTimeRange(booking: BookingResponse, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone });

  return `${formatter.format(new Date(booking.scheduledAt))} – ${formatter.format(
    new Date(booking.endsAt),
  )}`;
}

export function formatBookingPrice(booking: BookingResponse): string | null {
  return booking.priceMinor !== null && booking.currency
    ? formatMoney(booking.priceMinor, booking.currency)
    : null;
}

export type BookingAction = "APPROVE" | "DECLINE" | "CHECK_IN" | "COMPLETE" | "NO_SHOW";

export const BOOKING_ACTION_LABELS: Record<BookingAction, string> = {
  APPROVE: "Approve",
  DECLINE: "Decline",
  CHECK_IN: "Check in",
  COMPLETE: "Complete",
  NO_SHOW: "No-show",
};

/** Actions staff can take next; no-show only once the booking has started. */
export function getAvailableActions(booking: BookingResponse, now: Date): BookingAction[] {
  switch (booking.status) {
    case "PENDING":
      return ["APPROVE", "DECLINE"];
    case "CONFIRMED":
      return new Date(booking.scheduledAt) <= now ? ["CHECK_IN", "NO_SHOW"] : ["CHECK_IN"];
    case "CHECKED_IN":
      return ["COMPLETE"];
    default:
      return [];
  }
}

export function canStaffChange(booking: BookingResponse): boolean {
  return booking.status === "PENDING" || booking.status === "CONFIRMED";
}
