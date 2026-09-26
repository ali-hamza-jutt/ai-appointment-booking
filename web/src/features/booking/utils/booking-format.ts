import type {
  BookingDraftViewModel,
  StructuredBookingFormValues,
} from "@/features/booking/types/booking-ui";
import type {
  AppointmentResponse,
  ChatBookingDraft,
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

/** The side-panel view of a chat draft: the held slot, or just the chosen service. */
export function toBookingDraft(
  draft: ChatBookingDraft | null | undefined,
  timeZone: string,
): BookingDraftViewModel | null {
  const hold = draft?.hold;

  if (hold) {
    const isStillHeld = !hold.holdExpiresAt || new Date(hold.holdExpiresAt).getTime() > Date.now();

    return formatDraft({
      serviceName: hold.serviceName,
      scheduledAt: hold.startsAt,
      durationMinutes: hold.durationMinutes,
      notes: draft.notes ?? undefined,
      staffName: hold.staffName ?? undefined,
      price: hold.priceMinor !== null && hold.currency ? formatMoney(hold.priceMinor, hold.currency) : null,
      heldUntil: isStillHeld ? (hold.holdExpiresAt ?? undefined) : undefined,
      timeZone: draft.timeZone ?? timeZone,
    });
  }

  if (!draft?.service) return null;

  return formatDraft({
    serviceName: draft.service.name,
    scheduledAt: undefined,
    durationMinutes: draft.service.durationMinutes,
    notes: draft.notes ?? undefined,
    staffName: draft.staff?.displayName,
    price: formatMoney(draft.service.priceMinor, draft.service.currency),
    heldUntil: undefined,
    timeZone: draft.timeZone ?? timeZone,
  });
}

/** What the draft still needs before it can be confirmed. */
export function getMissingDraftFields(draft: ChatBookingDraft | null | undefined): string[] {
  return [...(draft?.service || draft?.hold ? [] : ["serviceName"]), ...(draft?.hold ? [] : ["scheduledAt"])];
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
  draft: ChatBookingDraft | null | undefined,
  timeZone: string,
): StructuredBookingFormValues {
  const localDateTime = draft?.hold
    ? getLocalDateTimeInputValues(draft.hold.startsAt, timeZone)
    : null;

  return {
    ...(draft?.notes ? { notes: draft.notes } : {}),
    scheduledDate: localDateTime?.date ?? "",
    scheduledTime: localDateTime?.time ?? "",
    serviceId: draft?.service?.id ?? "",
    ...(draft?.staff ? { staffId: draft.staff.id } : {}),
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
