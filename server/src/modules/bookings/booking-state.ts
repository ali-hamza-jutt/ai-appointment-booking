import type { BookingEventType, BookingStatus } from "./dto/booking.dto.js";

interface BookingTransition {
  from: readonly BookingStatus[];
  /** Null keeps the current status (for example a reschedule). */
  to: BookingStatus | null;
  /** Outbox event type published after the change commits. */
  outboxType: string;
}

/**
 * Every allowed booking state change. All writes go through `transition`
 * in the booking DAL, which checks this table.
 */
export const BOOKING_TRANSITIONS: Record<BookingEventType, BookingTransition> = {
  HOLD: { from: [], to: "HELD", outboxType: "booking.held" },
  REQUIRE_PAYMENT: {
    from: ["HELD"],
    to: "PENDING_PAYMENT",
    outboxType: "booking.payment_required",
  },
  CONFIRM: {
    from: ["HELD", "PENDING_PAYMENT"],
    to: "CONFIRMED",
    outboxType: "booking.confirmed",
  },
  REQUEST_APPROVAL: {
    from: ["HELD", "PENDING_PAYMENT"],
    to: "PENDING",
    outboxType: "booking.pending_approval",
  },
  APPROVE: { from: ["PENDING"], to: "CONFIRMED", outboxType: "booking.confirmed" },
  DECLINE: { from: ["PENDING"], to: "CANCELLED", outboxType: "booking.cancelled" },
  EXPIRE: {
    from: ["HELD", "PENDING_PAYMENT"],
    to: "EXPIRED",
    outboxType: "booking.expired",
  },
  CHECK_IN: { from: ["CONFIRMED"], to: "CHECKED_IN", outboxType: "booking.checked_in" },
  COMPLETE: { from: ["CHECKED_IN"], to: "COMPLETED", outboxType: "booking.completed" },
  MARK_NO_SHOW: { from: ["CONFIRMED"], to: "NO_SHOW", outboxType: "booking.no_show" },
  CANCEL: {
    from: ["HELD", "PENDING_PAYMENT", "PENDING", "CONFIRMED"],
    to: "CANCELLED",
    outboxType: "booking.cancelled",
  },
  RESCHEDULE: {
    from: ["PENDING", "CONFIRMED"],
    to: null,
    outboxType: "booking.rescheduled",
  },
};

export function canTransition(status: BookingStatus, event: BookingEventType): boolean {
  return BOOKING_TRANSITIONS[event].from.includes(status);
}

export function nextStatus(status: BookingStatus, event: BookingEventType): BookingStatus {
  return BOOKING_TRANSITIONS[event].to ?? status;
}
