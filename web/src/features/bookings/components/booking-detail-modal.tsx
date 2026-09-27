"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import { Modal } from "@/components/ui/modal";
import { SlotPicker } from "@/features/availability/components/slot-picker";
import { useBusinessDaySlots } from "@/features/availability/hooks/use-day-slots";
import { BOOKING_STATUS_PRESENTATION } from "@/features/bookings/constants/booking-status.constants";
import { useBookingActions } from "@/features/bookings/hooks/use-booking-actions";
import { BookingMessages } from "@/features/notifications/components/booking-messages";
import {
  canStaffChange,
  formatBookingPrice,
  formatTimeRange,
} from "@/features/bookings/utils/booking-format";
import {
  getListBookingsQueryKey,
  useListBookingEvents,
  useRescheduleBooking,
} from "@/generated/api/bookings/bookings";
import type { AvailableSlot, BookingResponse } from "@/generated/api/models";
import { getApiErrorMessage } from "@/lib/api/api-error";
import {
  formatDate,
  formatDateTime,
  getLocalDateTimeInputValues,
} from "@/lib/utils/date-time";

type DetailMode = "view" | "reschedule" | "cancel";

interface BookingDetailModalProps {
  booking: BookingResponse;
  businessId: string;
  businessSlug: string;
  onClose: () => void;
  timeZone: string;
}

export function BookingDetailModal({
  booking,
  businessId,
  businessSlug,
  onClose,
  timeZone,
}: BookingDetailModalProps) {
  const [mode, setMode] = useState<DetailMode>("view");
  const eventsQuery = useListBookingEvents(businessId, booking.id);
  const status = BOOKING_STATUS_PRESENTATION[booking.status];
  const price = formatBookingPrice(booking);

  return (
    <Modal
      description={`${formatDate(booking.scheduledAt, timeZone)} · ${formatTimeRange(booking, timeZone)}`}
      isOpen
      onClose={onClose}
      title={`${booking.serviceName} · ${booking.customer.name}`}
    >
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {booking.staff ? <Badge tone="neutral">{booking.staff.name}</Badge> : null}
          {price ? <Badge tone="neutral">{price}</Badge> : null}
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-muted">Customer</dt>
            <dd className="text-ink">{booking.customer.name}</dd>
            <dd className="text-xs text-muted">
              {[booking.customer.email, booking.customer.phone].filter(Boolean).join(" · ") ||
                "No contact details"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">Notes</dt>
            <dd className="whitespace-pre-wrap text-ink-soft">{booking.notes ?? "None"}</dd>
          </div>
          {booking.cancelReason ? (
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold text-muted">Cancellation reason</dt>
              <dd className="text-ink-soft">{booking.cancelReason}</dd>
            </div>
          ) : null}
        </dl>

        {mode === "reschedule" ? (
          <RescheduleForm
            booking={booking}
            businessId={businessId}
            onDone={() => setMode("view")}
            timeZone={timeZone}
          />
        ) : mode === "cancel" ? (
          <CancelForm
            bookingId={booking.id}
            businessId={businessId}
            businessSlug={businessSlug}
            onCancelled={onClose}
            onBack={() => setMode("view")}
          />
        ) : canStaffChange(booking) ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setMode("reschedule")} size="sm" variant="secondary">
              Reschedule
            </Button>
            <Button onClick={() => setMode("cancel")} size="sm" variant="danger">
              Cancel booking
            </Button>
          </div>
        ) : null}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">History</h3>
          {eventsQuery.isPending ? (
            <Skeleton className="h-16 rounded-[10px]" />
          ) : eventsQuery.isError ? (
            <Alert tone="danger">
              {getApiErrorMessage(eventsQuery.error, "History could not be loaded.")}
            </Alert>
          ) : (
            <ol className="space-y-2 border-l border-border pl-4">
              {eventsQuery.data.items.map((event) => (
                <li className="text-xs text-ink-soft" key={event.id}>
                  <span className="font-semibold text-ink">
                    {event.toStatus ? BOOKING_STATUS_PRESENTATION[event.toStatus].label : event.type}
                  </span>{" "}
                  · {event.actorType.toLowerCase()} · {formatDateTime(event.createdAt, timeZone)}
                </li>
              ))}
            </ol>
          )}
        </section>

        <BookingMessages bookingId={booking.id} businessId={businessId} timeZone={timeZone} />
      </div>
    </Modal>
  );
}

function RescheduleForm({
  booking,
  businessId,
  onDone,
  timeZone,
}: {
  booking: BookingResponse;
  businessId: string;
  onDone: () => void;
  timeZone: string;
}) {
  const queryClient = useQueryClient();
  const rescheduleMutation = useRescheduleBooking();
  const [date, setDate] = useState(
    getLocalDateTimeInputValues(booking.scheduledAt, timeZone)?.date ?? "",
  );
  const [slot, setSlot] = useState<AvailableSlot | null>(null);
  const daySlots = useBusinessDaySlots(businessId, {
    date,
    serviceId: booking.serviceId ?? "",
    timeZone,
    ...(booking.staff ? { staffId: booking.staff.id } : {}),
  });

  function submit() {
    if (!slot) return;

    rescheduleMutation.mutate(
      { businessId, bookingId: booking.id, data: { startsAt: String(slot.startsAt) } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey(businessId) });
          onDone();
        },
      },
    );
  }

  return (
    <div className="space-y-4 rounded-[10px] border border-border p-4">
      {rescheduleMutation.error ? (
        <Alert tone="danger">
          {getApiErrorMessage(rescheduleMutation.error, "The booking could not be moved.")}
        </Alert>
      ) : null}
      <SlotPicker
        date={date}
        error={daySlots.error}
        idPrefix="staff-reschedule"
        isLoading={daySlots.isLoading}
        onDateChange={(value) => {
          setDate(value);
          setSlot(null);
        }}
        onSelect={setSlot}
        selectedStartsAt={slot ? String(slot.startsAt) : null}
        slots={daySlots.slots}
        timeZone={timeZone}
      />
      <div className="flex justify-end gap-2">
        <Button onClick={onDone} size="sm" variant="secondary">
          Back
        </Button>
        <Button disabled={!slot} isLoading={rescheduleMutation.isPending} onClick={submit} size="sm">
          Move booking
        </Button>
      </div>
    </div>
  );
}

function CancelForm({
  bookingId,
  businessId,
  businessSlug,
  onBack,
  onCancelled,
}: {
  bookingId: string;
  businessId: string;
  businessSlug: string;
  onBack: () => void;
  onCancelled: () => void;
}) {
  const actions = useBookingActions(businessId, businessSlug);
  const [reason, setReason] = useState("");

  return (
    <div className="space-y-3 rounded-[10px] border border-danger-border bg-danger-soft p-4">
      {actions.error ? (
        <Alert tone="danger">
          {getApiErrorMessage(actions.error, "The booking could not be cancelled.")}
        </Alert>
      ) : null}
      <TextField
        id="staff-cancel-reason"
        label="Reason shared with the customer (optional)"
        maxLength={500}
        onChange={(event) => setReason(event.target.value)}
        value={reason}
      />
      <div className="flex justify-end gap-2">
        <Button onClick={onBack} size="sm" variant="secondary">
          Keep booking
        </Button>
        <Button
          isLoading={actions.isPending}
          onClick={() => actions.cancel(bookingId, reason, onCancelled)}
          size="sm"
          variant="danger"
        >
          Cancel booking
        </Button>
      </div>
    </div>
  );
}
