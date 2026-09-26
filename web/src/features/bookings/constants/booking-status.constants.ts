import type { BadgeTone } from "@/components/ui/badge";
import type { BookingStatus } from "@/generated/api/models";

export const BOOKING_STATUS_PRESENTATION: Record<
  BookingStatus,
  { label: string; tone: BadgeTone }
> = {
  HELD: { label: "Held", tone: "warning" },
  PENDING_PAYMENT: { label: "Awaiting payment", tone: "warning" },
  PENDING: { label: "Awaiting approval", tone: "warning" },
  CONFIRMED: { label: "Confirmed", tone: "brand" },
  CHECKED_IN: { label: "Checked in", tone: "success" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  NO_SHOW: { label: "No-show", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

export const BOOKING_UI_CONSTANTS = {
  DEMO_BUSINESS_SLUG: "bookwise-demo",
  PAGE_SIZE: 100,
} as const;
