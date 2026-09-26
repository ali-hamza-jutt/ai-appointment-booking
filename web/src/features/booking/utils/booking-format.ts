import type {
  BookingDraftViewModel,
  StructuredBookingFormValues,
} from "@/features/booking/types/booking-ui";
import type {
  AppointmentBookingContext,
  AppointmentResponse,
} from "@/generated/api/models";
import { getLocalDateTimeInputValues } from "@/lib/utils/date-time";
import { formatMoney } from "@/lib/utils/money";

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

  const hasActiveHold =
    Boolean(context.holdExpiresAt) &&
    new Date(context.holdExpiresAt as string).getTime() > Date.now();

  return formatDraft({
    serviceName: context.serviceName,
    scheduledAt: context.scheduledAt,
    durationMinutes: context.durationMinutes,
    notes: context.notes,
    staffName: context.staffName,
    price:
      context.priceMinor !== undefined && context.currency
        ? formatMoney(context.priceMinor, context.currency)
        : null,
    heldUntil: hasActiveHold ? (context.holdExpiresAt as string) : undefined,
    timeZone,
  });
}

export function toConfirmedBookingDraft(
  appointment: AppointmentResponse,
): BookingDraftViewModel {
  return formatDraft({
    serviceName: appointment.serviceName,
    scheduledAt: appointment.scheduledAt,
    durationMinutes: appointment.durationMinutes,
    notes: appointment.notes ?? undefined,
    staffName: appointment.staff?.name,
    price:
      appointment.priceMinor !== null && appointment.currency
        ? formatMoney(appointment.priceMinor, appointment.currency)
        : null,
    heldUntil: undefined,
    timeZone: appointment.timeZone,
  });
}

export function toStructuredBookingFormValues(
  context: AppointmentBookingContext | null | undefined,
  timeZone: string,
): StructuredBookingFormValues {
  const localDateTime = context?.scheduledAt
    ? getLocalDateTimeInputValues(context.scheduledAt, timeZone)
    : null;

  return {
    ...(context?.notes ? { notes: context.notes } : {}),
    scheduledDate: localDateTime?.date ?? "",
    scheduledTime: localDateTime?.time ?? "",
    serviceId: context?.serviceId ?? "",
    ...(context?.staffId ? { staffId: context.staffId } : {}),
  };
}

function formatDraft(input: {
  durationMinutes: number | undefined;
  heldUntil: string | undefined;
  notes: string | undefined;
  price: string | null;
  scheduledAt: string | undefined;
  serviceName: string | undefined;
  staffName: string | undefined;
  timeZone: string;
}): BookingDraftViewModel {
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const hasValidDate = scheduledAt !== null && !Number.isNaN(scheduledAt.getTime());
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeStyle: "short",
    timeZone: input.timeZone,
  });

  return {
    date: hasValidDate
      ? new Intl.DateTimeFormat("en-US", {
          dateStyle: "full",
          timeZone: input.timeZone,
        }).format(scheduledAt)
      : "Date not provided",
    duration:
      input.durationMinutes !== undefined ? `${input.durationMinutes} minutes` : "Set by service",
    heldUntil: input.heldUntil ? timeFormatter.format(new Date(input.heldUntil)) : null,
    notes: input.notes || "No notes added.",
    price: input.price,
    staff: input.staffName ?? null,
    time: hasValidDate ? timeFormatter.format(scheduledAt) : "Time not provided",
    timezone: input.timeZone,
    title: input.serviceName || "Service not provided",
  };
}
