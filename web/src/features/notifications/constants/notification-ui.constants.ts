import type { BadgeTone } from "@/components/ui/badge";
import type {
  NotificationChannel,
  NotificationKind,
  NotificationStatus,
} from "@/generated/api/models";

export const NOTIFICATION_UI_CONSTANTS = {
  KIND_LABELS: {
    BOOKING_CONFIRMED: "Booking confirmed",
    BOOKING_REQUESTED: "Request received (needs approval)",
    BOOKING_RESCHEDULED: "Booking moved",
    BOOKING_CANCELLED: "Booking cancelled",
    BOOKING_REMINDER: "Reminder",
    WAITLIST_OFFER: "Waitlist: a time opened up",
    REVIEW_REQUEST: "Review request (2 hours after a visit)",
  } satisfies Record<NotificationKind, string>,
  CHANNEL_LABELS: {
    EMAIL: "Email",
    SMS: "Text message",
    PUSH: "Browser",
  } satisfies Record<NotificationChannel, string>,
  STATUS_PRESENTATION: {
    PENDING: { label: "Sending", tone: "neutral" },
    SENT: { label: "Sent", tone: "brand" },
    DELIVERED: { label: "Delivered", tone: "success" },
    FAILED: { label: "Failed", tone: "danger" },
    SKIPPED: { label: "Opted out", tone: "neutral" },
  } satisfies Record<NotificationStatus, { label: string; tone: BadgeTone }>,
  /** Offsets offered on the settings page, in minutes before the appointment. */
  REMINDER_OPTIONS: [10_080, 2_880, 1_440, 180, 120, 60, 30],
  MAX_REMINDERS: 5,
  DEFAULT_QUIET_HOURS: { START: "21:00", END: "08:00" },
  MAX_SMS_LENGTH: 480,
} as const;

/** "1 day before", "2 hours before", "90 minutes before". */
export function describeReminderOffset(minutes: number): string {
  const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"} before`;

  if (minutes % 10_080 === 0) return plural(minutes / 10_080, "week");
  if (minutes % 1_440 === 0) return plural(minutes / 1_440, "day");
  if (minutes % 60 === 0) return plural(minutes / 60, "hour");

  return plural(minutes, "minute");
}
