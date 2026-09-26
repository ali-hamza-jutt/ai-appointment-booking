"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import { CalendarIcon, TrashIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { SlotPicker } from "@/features/availability/components/slot-picker";
import { usePublicDaySlots } from "@/features/availability/hooks/use-day-slots";
import {
  getGetAppointmentQueryKey,
  getListAppointmentsQueryKey,
  useCancelAppointment,
  useRescheduleAppointment,
} from "@/generated/api/appointments/appointments";
import type { AppointmentResponse, AvailableSlot } from "@/generated/api/models";
import { getApiErrorMessage } from "@/lib/api/api-error";
import {
  getCurrentLocalDate,
  getLocalDateTimeInputValues,
} from "@/lib/utils/date-time";

interface AppointmentActionsProps {
  appointment: AppointmentResponse;
}

export function AppointmentActions({ appointment }: AppointmentActionsProps) {
  const queryClient = useQueryClient();
  const cancelMutation = useCancelAppointment();
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const hasActions = appointment.canCancel || appointment.canReschedule;

  function updateAppointment(response: AppointmentResponse) {
    queryClient.setQueryData(getGetAppointmentQueryKey(appointment.id), response);
    void queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey() });
  }

  function cancelAppointment() {
    if (cancelMutation.isPending) return;

    cancelMutation.mutate(
      {
        appointmentId: appointment.id,
        data: cancelReason.trim() ? { reason: cancelReason.trim() } : {},
      },
      {
        onSuccess: (response) => {
          updateAppointment(response);
          setFeedback("Appointment cancelled.");
          setIsCancelOpen(false);
        },
      },
    );
  }

  if (!hasActions && !feedback) {
    return appointment.status === "CONFIRMED" || appointment.status === "PENDING" ? (
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <Alert tone="info">
          This appointment is inside {appointment.business.name}&rsquo;s change window. Contact
          them to change or cancel it.
        </Alert>
      </div>
    ) : null;
  }

  return (
    <div className="border-b border-border px-5 py-4 sm:px-6">
      {feedback ? <Alert tone="success">{feedback}</Alert> : null}

      {hasActions ? (
        <div className={feedback ? "mt-4 flex flex-wrap gap-2" : "flex flex-wrap gap-2"}>
          {appointment.canReschedule ? (
            <Button
              leadingIcon={<CalendarIcon className="size-4" />}
              onClick={() => setIsRescheduleOpen(true)}
              variant="secondary"
            >
              Reschedule
            </Button>
          ) : null}
          {appointment.canCancel ? (
            <Button
              leadingIcon={<TrashIcon className="size-4" />}
              onClick={() => {
                cancelMutation.reset();
                setIsCancelOpen(true);
              }}
              variant="danger"
            >
              {appointment.status === "HELD" ? "Release hold" : "Cancel appointment"}
            </Button>
          ) : null}
        </div>
      ) : null}

      <Modal
        description="The appointment stays in your history and its time becomes available to others."
        isOpen={isCancelOpen}
        onClose={() => !cancelMutation.isPending && setIsCancelOpen(false)}
        title="Cancel appointment?"
      >
        <div className="space-y-4 p-5 sm:p-6">
          {cancelMutation.error ? (
            <Alert tone="danger">
              {getApiErrorMessage(
                cancelMutation.error,
                "The appointment could not be cancelled. Please try again.",
              )}
            </Alert>
          ) : null}
          <TextField
            id="cancel-reason"
            label="Reason (optional)"
            maxLength={500}
            onChange={(event) => setCancelReason(event.target.value)}
            value={cancelReason}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              disabled={cancelMutation.isPending}
              onClick={() => setIsCancelOpen(false)}
              variant="secondary"
            >
              Keep appointment
            </Button>
            <Button
              isLoading={cancelMutation.isPending}
              onClick={cancelAppointment}
              variant="danger"
            >
              Cancel appointment
            </Button>
          </div>
        </div>
      </Modal>

      {isRescheduleOpen ? (
        <RescheduleModal
          appointment={appointment}
          onClose={() => setIsRescheduleOpen(false)}
          onRescheduled={(response) => {
            updateAppointment(response);
            setFeedback("Appointment rescheduled.");
            setIsRescheduleOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function RescheduleModal({
  appointment,
  onClose,
  onRescheduled,
}: {
  appointment: AppointmentResponse;
  onClose: () => void;
  onRescheduled: (appointment: AppointmentResponse) => void;
}) {
  const rescheduleMutation = useRescheduleAppointment();
  const initial = getLocalDateTimeInputValues(appointment.scheduledAt, appointment.timeZone);
  const [date, setDate] = useState(initial?.date ?? "");
  const [slot, setSlot] = useState<AvailableSlot | null>(null);
  const daySlots = usePublicDaySlots(appointment.business.slug, {
    date,
    serviceId: appointment.serviceId ?? "",
    timeZone: appointment.timeZone,
    ...(appointment.staff ? { staffId: appointment.staff.id } : {}),
  });

  function submit() {
    if (!slot) return;

    rescheduleMutation.mutate(
      {
        appointmentId: appointment.id,
        data: { scheduledDate: date, scheduledTime: slot.time },
      },
      { onSuccess: onRescheduled },
    );
  }

  return (
    <Modal
      description={`Choose a new open time with ${appointment.staff?.name ?? appointment.business.name}.`}
      isOpen
      onClose={() => !rescheduleMutation.isPending && onClose()}
      title="Reschedule appointment"
    >
      <div className="space-y-4 p-5 sm:p-6">
        {rescheduleMutation.error ? (
          <Alert tone="danger">
            {getApiErrorMessage(
              rescheduleMutation.error,
              "The appointment could not be rescheduled. Please try again.",
            )}
          </Alert>
        ) : null}
        <SlotPicker
          date={date}
          error={daySlots.error}
          idPrefix="reschedule"
          isLoading={daySlots.isLoading}
          minDate={getCurrentLocalDate(appointment.timeZone)}
          onDateChange={(value) => {
            setDate(value);
            setSlot(null);
          }}
          onSelect={setSlot}
          selectedStartsAt={slot ? String(slot.startsAt) : null}
          slots={daySlots.slots}
          timeZone={appointment.timeZone}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            disabled={rescheduleMutation.isPending}
            onClick={onClose}
            variant="secondary"
          >
            Keep current time
          </Button>
          <Button disabled={!slot} isLoading={rescheduleMutation.isPending} onClick={submit}>
            Save new time
          </Button>
        </div>
      </div>
    </Modal>
  );
}
