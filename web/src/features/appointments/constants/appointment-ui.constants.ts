import { BookingStatus } from "@/generated/api/models";
import type { AppointmentFilter } from "@/features/appointments/types/appointment-ui";

export const APPOINTMENT_UI_CONSTANTS = {
  PAGE_SIZE: 12,
  FILTERS: [
    { label: "All", value: "ALL" },
    { label: "Confirmed", value: BookingStatus.CONFIRMED },
    { label: "Awaiting approval", value: BookingStatus.PENDING },
    { label: "Completed", value: BookingStatus.COMPLETED },
    { label: "Cancelled", value: BookingStatus.CANCELLED },
  ] satisfies ReadonlyArray<{ label: string; value: AppointmentFilter }>,
} as const;
