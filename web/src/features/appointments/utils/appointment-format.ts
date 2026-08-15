import type { BadgeTone } from "@/components/ui/badge";
import type {
  AppointmentResponse,
  AppointmentStatus,
} from "@/generated/api/models";
import type { AppointmentViewModel } from "@/features/appointments/types/appointment-ui";

const statusPresentation: Record<
  AppointmentStatus,
  { label: string; tone: BadgeTone }
> = {
  CANCELLED: { label: "Cancelled", tone: "danger" },
  COMPLETED: { label: "Completed", tone: "success" },
  CONFIRMED: { label: "Confirmed", tone: "brand" },
  PENDING: { label: "Pending", tone: "warning" },
};

export function toAppointmentViewModel(
  appointment: AppointmentResponse,
): AppointmentViewModel {
  const scheduledAt = new Date(appointment.scheduledAt);
  const createdAt = new Date(appointment.createdAt);
  const status = statusPresentation[appointment.status];
  const timeZone = appointment.timeZone;

  return {
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
    reference: appointment.id.slice(0, 8).toUpperCase(),
    sourceLabel:
      appointment.source === "CHAT" ? "BookWise AI assistant" : "Appointment form",
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
