import type { ServiceBookingType } from "@/generated/api/models";

export const CATALOG_UI_CONSTANTS = {
  DEFAULT_DURATION_MINUTES: 30,
  DEFAULT_CLASS_CAPACITY: 10,
  MIN_DURATION_MINUTES: 5,
  MAX_DURATION_MINUTES: 720,
  MAX_BUFFER_MINUTES: 240,
  MAX_CLASS_CAPACITY: 500,
  UNCATEGORIZED_LABEL: "Other services",
} as const;

export const BOOKING_TYPE_OPTIONS: ReadonlyArray<{
  value: ServiceBookingType;
  label: string;
  description: string;
}> = [
  {
    value: "APPOINTMENT",
    label: "Appointment",
    description: "One customer per booking, for example a haircut or consultation.",
  },
  {
    value: "CLASS",
    label: "Class",
    description: "Several customers share a session up to a seat limit.",
  },
];
