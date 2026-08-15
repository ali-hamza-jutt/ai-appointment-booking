import type {
  AppointmentBookingContext,
  AppointmentResponse,
} from "@/generated/api/models";
import type {
  BookingDraftViewModel,
  StructuredBookingFormValues,
} from "@/features/booking/types/booking-ui";
import { getLocalDateTimeInputValues } from "@/lib/utils/date-time";

const DEFAULT_APPOINTMENT_DURATION_MINUTES = 30;

export function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function toBookingDraft(
  context: AppointmentBookingContext | null | undefined,
  timeZone: string,
): BookingDraftViewModel | null {
  if (!context || !Object.values(context).some((value) => value !== undefined)) {
    return null;
  }

  return formatDraft(
    context.serviceName,
    context.scheduledAt,
    context.durationMinutes,
    context.notes,
    timeZone,
  );
}

export function toConfirmedBookingDraft(
  appointment: AppointmentResponse,
): BookingDraftViewModel {
  return formatDraft(
    appointment.serviceName,
    appointment.scheduledAt,
    appointment.durationMinutes,
    appointment.notes ?? undefined,
    appointment.timeZone,
  );
}

export function toStructuredBookingFormValues(
  context: AppointmentBookingContext | null | undefined,
  timeZone: string,
): StructuredBookingFormValues {
  const localDateTime = context?.scheduledAt
    ? getLocalDateTimeInputValues(context.scheduledAt, timeZone)
    : null;

  return {
    durationMinutes:
      context?.durationMinutes ?? DEFAULT_APPOINTMENT_DURATION_MINUTES,
    ...(context?.notes ? { notes: context.notes } : {}),
    scheduledDate: localDateTime?.date ?? "",
    scheduledTime: localDateTime?.time ?? "",
    serviceName: context?.serviceName ?? "",
  };
}

function formatDraft(
  serviceName: string | undefined,
  scheduledAtValue: string | undefined,
  durationMinutes: number | undefined,
  notes: string | undefined,
  timeZone: string,
): BookingDraftViewModel {
  const scheduledAt = scheduledAtValue ? new Date(scheduledAtValue) : null;
  const hasValidDate = scheduledAt !== null && !Number.isNaN(scheduledAt.getTime());

  return {
    date: hasValidDate
      ? new Intl.DateTimeFormat("en-US", {
          dateStyle: "full",
          timeZone,
        }).format(scheduledAt)
      : "Date not provided",
    duration: `${durationMinutes ?? DEFAULT_APPOINTMENT_DURATION_MINUTES} minutes`,
    notes: notes || "No notes added.",
    time: hasValidDate
      ? new Intl.DateTimeFormat("en-US", {
          timeStyle: "short",
          timeZone,
        }).format(scheduledAt)
      : "Time not provided",
    timezone: timeZone,
    title: serviceName || "Service not provided",
  };
}
