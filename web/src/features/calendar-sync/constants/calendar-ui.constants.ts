import type { CalendarProvider } from "@/generated/api/models";

export const CALENDAR_UI_CONSTANTS = {
  PROVIDER_LABELS: {
    GOOGLE: "Google Calendar",
    MICROSOFT: "Microsoft 365",
  } satisfies Record<CalendarProvider, string>,
  /** Why connecting failed, keyed by the reason the API puts on the return URL. */
  RETURN_ERRORS: {
    denied: "Calendar access was not granted, so nothing was connected.",
    expired: "Connecting took too long. Please try again.",
    invalid: "That calendar link was not valid. Please start again from this page.",
    unavailable: "That calendar provider is not available right now.",
    provider: "The calendar provider reported a problem. Please try again.",
    failed: "The calendar could not be connected. Please try again.",
  } as Record<string, string>,
} as const;
