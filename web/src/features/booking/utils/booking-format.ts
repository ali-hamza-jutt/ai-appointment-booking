import type {
  AppointmentBookingContext,
  AppointmentResponse,
} from "@/generated/api/models";
import type {
  BookingDraftViewModel,
  StructuredBookingFormValues,
} from "@/features/booking/types/booking-ui";

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
  timeZone: string,
): BookingDraftViewModel {
  return formatDraft(
    appointment.serviceName,
    appointment.scheduledAt,
    appointment.durationMinutes,
    appointment.notes ?? undefined,
    timeZone,
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

export function getCurrentLocalDate(timeZone: string): string {
  return (
    getLocalDateTimeInputValues(new Date().toISOString(), timeZone)?.date ?? ""
  );
}

function getLocalDateTimeInputValues(
  scheduledAtValue: string,
  timeZone: string,
): { date: string; time: string } | null {
  const scheduledAt = new Date(scheduledAtValue);

  if (Number.isNaN(scheduledAt.getTime())) return null;

  try {
    const parts = new Map(
      new Intl.DateTimeFormat("en-US", {
        calendar: "iso8601",
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
        month: "2-digit",
        numberingSystem: "latn",
        timeZone,
        year: "numeric",
      })
        .formatToParts(scheduledAt)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    const year = parts.get("year");
    const month = parts.get("month");
    const day = parts.get("day");
    const hour = parts.get("hour");
    const minute = parts.get("minute");

    if (!year || !month || !day || !hour || !minute) return null;

    return {
      date: `${year}-${month}-${day}`,
      time: `${hour}:${minute}`,
    };
  } catch {
    return null;
  }
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
