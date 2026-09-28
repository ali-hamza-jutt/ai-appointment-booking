import type { AppointmentViewModel } from "@/features/appointments/types/appointment-ui";
import { BOOKING_STATUS_PRESENTATION } from "@/features/bookings/constants/booking-status.constants";
import type { AppointmentResponse } from "@/generated/api/models";
import { formatMoney } from "@/lib/utils/money";

const SOURCE_LABELS: Record<AppointmentResponse["source"], string> = {
  CHAT: "BookWise AI assistant",
  FORM: "Booking form",
  STAFF: "Booked by the business",
  WAITLIST: "Waitlist",
};

export function toAppointmentViewModel(
  appointment: AppointmentResponse,
): AppointmentViewModel {
  const scheduledAt = new Date(appointment.scheduledAt);
  const createdAt = new Date(appointment.createdAt);
  const status = BOOKING_STATUS_PRESENTATION[appointment.status];
  const timeZone = appointment.timeZone;

  return {
    businessName: appointment.business.name,
    createdAtLabel: formatDateTime(createdAt, timeZone, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    date: formatDateTime(scheduledAt, timeZone, { dateStyle: "full" }),
    dateTimeLabel: formatDateTime(scheduledAt, timeZone, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    duration: `${appointment.durationMinutes} minutes`,
    id: appointment.id,
    notes: appointment.notes || "No notes added.",
    priceLabel:
      appointment.priceMinor !== null && appointment.currency
        ? formatMoney(appointment.priceMinor, appointment.currency)
        : "Not set",
    reference: appointment.id.slice(0, 8).toUpperCase(),
    sourceLabel: SOURCE_LABELS[appointment.source],
    staffName: appointment.staff?.name ?? "Any available",
    status: appointment.status,
    statusLabel: status.label,
    statusTone: status.tone,
    time: formatDateTime(scheduledAt, timeZone, { timeStyle: "short" }),
    timezone: timeZone,
    title: appointment.serviceName,
  };
}

function formatDateTime(
  value: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  if (Number.isNaN(value.getTime())) return "Unavailable";

  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone,
  }).format(value);
}
