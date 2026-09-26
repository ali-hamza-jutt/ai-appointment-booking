"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarIcon, CheckCircleIcon, ClockIcon, TrashIcon, UserIcon } from "@/components/ui/icons";
import type {
  ChatAction,
  ChatBookingSummary,
  ChatConfirmPart,
  ChatMessagePart,
  ChatServiceCard,
  ChatSlotPickerPart,
} from "@/generated/api/models";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";

interface ChatMessagePartsProps {
  parts: ChatMessagePart[];
  /** Older replies stay visible but can't be tapped. */
  disabled: boolean;
  onAction: (action: ChatAction, label: string) => void;
}

/** Cards and buttons that come with an assistant reply. */
export function ChatMessageParts({ disabled, onAction, parts }: ChatMessagePartsProps) {
  const visible = parts.filter((part) => part.type !== "text");

  if (visible.length === 0) return null;

  return (
    <div className="mt-3 space-y-3">
      {visible.map((part, index) => {
        switch (part.type) {
          case "service_cards":
            return <ServiceCards disabled={disabled} key={index} onAction={onAction} services={part.services} />;
          case "slot_picker":
            return <SlotPicker disabled={disabled} key={index} onAction={onAction} part={part} />;
          case "booking_summary":
            return <BookingSummaryCard booking={part.booking} key={index} />;
          case "booking_list":
            return (
              <div className="space-y-2" key={index}>
                {part.bookings.map((booking) => (
                  <BookingSummaryCard booking={booking} key={booking.bookingId} />
                ))}
              </div>
            );
          case "confirm":
            return <ConfirmButton disabled={disabled} key={index} onAction={onAction} part={part} />;
          default:
            return null;
        }
      })}
    </div>
  );
}

function ServiceCards({
  disabled,
  onAction,
  services,
}: {
  disabled: boolean;
  onAction: ChatMessagePartsProps["onAction"];
  services: ChatServiceCard[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {services.map((service) => (
        <button
          className="rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-brand disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border"
          disabled={disabled}
          key={service.id}
          onClick={() => onAction({ type: "select_service", serviceId: service.id }, service.name)}
          type="button"
        >
          <span className="block text-sm font-semibold text-ink">{service.name}</span>
          <span className="mt-0.5 block text-xs text-muted">
            {service.durationMinutes} min · {formatMoney(service.priceMinor, service.currency)}
          </span>
          {service.description ? (
            <span className="mt-1 line-clamp-2 block text-xs text-ink-soft">{service.description}</span>
          ) : null}
          <span className="mt-2 block text-xs font-semibold text-brand">See open times</span>
        </button>
      ))}
    </div>
  );
}

function localParts(value: string, timeZone: string) {
  const date = new Date(value);

  return {
    day: new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone }).format(date),
    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(date),
  };
}

function SlotPicker({
  disabled,
  onAction,
  part,
}: {
  disabled: boolean;
  onAction: ChatMessagePartsProps["onAction"];
  part: ChatSlotPickerPart;
}) {
  const days = new Map<string, ChatSlotPickerPart["slots"]>();

  for (const slot of part.slots) {
    const { day } = localParts(slot.startsAt, part.timeZone);

    days.set(day, [...(days.get(day) ?? []), slot]);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-xs font-semibold text-muted">
        {part.rescheduleBookingId ? `New time for ${part.serviceName}` : `${part.serviceName} · open times`}
      </p>
      <div className="mt-2 space-y-2.5">
        {[...days].map(([day, slots]) => (
          <div key={day}>
            <p className="text-xs font-medium text-ink">{day}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {slots.map((slot) => {
                const { time } = localParts(slot.startsAt, part.timeZone);
                const label = `${time} on ${day}${slot.staffName ? ` with ${slot.staffName}` : ""}`;

                return (
                  <button
                    aria-label={label}
                    className="rounded-full border border-border bg-surface-subtle px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:text-ink-soft"
                    disabled={disabled}
                    key={slot.token}
                    onClick={() =>
                      onAction(
                        part.rescheduleBookingId
                          ? { type: "reschedule_booking", bookingId: part.rescheduleBookingId, slotToken: slot.token }
                          : { type: "select_slot", slotToken: slot.token },
                        label,
                      )
                    }
                    type="button"
                  >
                    {time}
                    {slot.staffName ? <span className="text-muted"> · {slot.staffName}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const STATUS_TONES: Record<string, "brand" | "success" | "warning" | "neutral" | "danger"> = {
  HELD: "warning",
  PENDING: "warning",
  PENDING_PAYMENT: "warning",
  CONFIRMED: "success",
  CANCELLED: "danger",
  EXPIRED: "neutral",
};

const STATUS_LABELS: Record<string, string> = {
  HELD: "Held",
  PENDING: "Awaiting approval",
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

function BookingSummaryCard({ booking }: { booking: ChatBookingSummary }) {
  const { day, time } = localParts(booking.startsAt, booking.timeZone);

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{booking.serviceName}</p>
        <Badge tone={STATUS_TONES[booking.status] ?? "neutral"}>{STATUS_LABELS[booking.status] ?? booking.status}</Badge>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5">
          <CalendarIcon className="size-3.5 text-brand" /> {day}
        </span>
        <span className="flex items-center gap-1.5">
          <ClockIcon className="size-3.5 text-brand" /> {time} · {booking.durationMinutes} min
          {booking.priceMinor !== null && booking.currency ? ` · ${formatMoney(booking.priceMinor, booking.currency)}` : ""}
        </span>
        {booking.staffName ? (
          <span className="flex items-center gap-1.5">
            <UserIcon className="size-3.5 text-brand" /> {booking.staffName}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ConfirmButton({
  disabled,
  onAction,
  part,
}: {
  disabled: boolean;
  onAction: ChatMessagePartsProps["onAction"];
  part: ChatConfirmPart;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", disabled && "opacity-70")}>
      <Button
        disabled={disabled}
        leadingIcon={
          part.tone === "danger" ? <TrashIcon className="size-4" /> : <CheckCircleIcon className="size-4" />
        }
        onClick={() => onAction(part.action, part.label)}
        size="sm"
        variant={part.tone === "danger" ? "danger" : "primary"}
      >
        {part.label}
      </Button>
      <span className="text-xs text-muted">{part.description}</span>
    </div>
  );
}
