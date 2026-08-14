import { AppointmentStatus } from "@/generated/api/models";
import type { AppointmentFilter } from "@/features/appointments/types/appointment-ui";

export const APPOINTMENT_UI_CONSTANTS = {
  PAGE_SIZE: 12,
  FILTERS: [
    { label: "All", value: "ALL" },
    { label: "Pending", value: AppointmentStatus.PENDING },
    { label: "Confirmed", value: AppointmentStatus.CONFIRMED },
    { label: "Completed", value: AppointmentStatus.COMPLETED },
    { label: "Cancelled", value: AppointmentStatus.CANCELLED },
  ] satisfies ReadonlyArray<{ label: string; value: AppointmentFilter }>,
} as const;
