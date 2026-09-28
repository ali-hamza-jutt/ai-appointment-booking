import { CHAT_CONSTANTS, REALTIME_CONSTANTS } from "../../../constants/app.constants.js";

const STATUS = REALTIME_CONSTANTS.STATUS;

/** "Thursday 5 Nov" for a YYYY-MM-DD date; null if it isn't one. */
function describeDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(`${value}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(CHAT_CONSTANTS.RESPONSE_LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

/** A short progress line for the customer while a tool runs. */
export function describeToolCall(name: string, args: unknown): string {
  const input = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;

  switch (name) {
    case "search_services":
      return STATUS.SEARCH_SERVICES;
    case "list_staff":
      return STATUS.LIST_STAFF;
    case "get_availability": {
      const day = describeDate(input.date);

      return day ? `${STATUS.CHECK_DAY} ${day}…` : `${STATUS.CHECK_DAY} availability…`;
    }
    case "propose_booking":
      return STATUS.PROPOSE_BOOKING;
    case "list_my_bookings":
      return STATUS.LIST_BOOKINGS;
    case "propose_cancel":
    case "propose_reschedule":
      return STATUS.PREPARE_CHANGE;
    case "search_knowledge":
      return STATUS.SEARCH_KNOWLEDGE;
    case "handoff_to_human":
      return STATUS.HANDOFF;
    case "remember_preference":
      return STATUS.REMEMBER_PREFERENCE;
    case "forget_preference":
      return STATUS.FORGET_PREFERENCE;
    case "join_waitlist":
      return STATUS.JOIN_WAITLIST;
    default:
      return STATUS.THINKING;
  }
}
