"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import { CalendarIcon, TrashIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import {
  getGetAppointmentQueryKey,
  getListAppointmentsQueryKey,
  useCancelAppointment,
  useRescheduleAppointment,
} from "@/generated/api/appointments/appointments";
import type { AppointmentResponse } from "@/generated/api/models";
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
  const rescheduleMutation = useRescheduleAppointment();
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const isBusy = cancelMutation.isPending || rescheduleMutation.isPending;
  const canChangeAppointment =
    appointment.status === "PENDING" || appointment.status === "CONFIRMED";

  function updateAppointment(response: AppointmentResponse) {
    queryClient.setQueryData(
      getGetAppointmentQueryKey(appointment.id),
      response,
    );
    void queryClient.invalidateQueries({
      queryKey: getListAppointmentsQueryKey(),
    });
  }

  function openRescheduleDialog() {
    const currentValues = getLocalDateTimeInputValues(
      appointment.scheduledAt,
      appointment.timeZone,
    );

    setScheduledDate(currentValues?.date ?? "");
    setScheduledTime(currentValues?.time ?? "");
    setFormError(null);
    rescheduleMutation.reset();
    setIsRescheduleOpen(true);
  }

  function cancelAppointment() {
    if (isBusy) return;

    cancelMutation.mutate(
      { appointmentId: appointment.id },
      {
        onError: (error) => {
          setFormError(
            getApiErrorMessage(
              error,
              "The appointment could not be cancelled. Please try again.",
            ),
          );
        },
        onSuccess: (response) => {
          updateAppointment(response);
          setFeedback("Appointment cancelled successfully.");
          setFormError(null);
          setIsCancelOpen(false);
        },
      },
    );
  }

  function submitReschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isBusy) return;

    if (!scheduledDate || !scheduledTime) {
      setFormError("Choose both a new date and time.");
      return;
    }

    rescheduleMutation.mutate(
      {
        appointmentId: appointment.id,
        data: { scheduledDate, scheduledTime },
      },
      {
        onError: (error) => {
          setFormError(
            getApiErrorMessage(
              error,
              "The appointment could not be rescheduled. Please try again.",
            ),
          );
        },
        onSuccess: (response) => {
          updateAppointment(response);
          setFeedback("Appointment rescheduled successfully.");
          setFormError(null);
          setIsRescheduleOpen(false);
        },
      },
    );
  }

  if (!canChangeAppointment && !feedback) return null;

  return (
    <div className="border-b border-border px-5 py-4 sm:px-6">
      {feedback ? <Alert tone="success">{feedback}</Alert> : null}

      {canChangeAppointment ? (
        <div className={feedback ? "mt-4 flex flex-wrap gap-2" : "flex flex-wrap gap-2"}>
          <Button
            disabled={isBusy}
            leadingIcon={<CalendarIcon className="size-4" />}
            onClick={openRescheduleDialog}
            variant="secondary"
          >
            Reschedule
          </Button>
          <Button
            disabled={isBusy}
            leadingIcon={<TrashIcon className="size-4" />}
            onClick={() => {
              setFormError(null);
              cancelMutation.reset();
              setIsCancelOpen(true);
            }}
            variant="danger"
          >
            Cancel appointment
          </Button>
        </div>
      ) : null}

      <Modal
        description="The appointment will remain in your history, but its time will become available."
        isOpen={isCancelOpen}
        onClose={() => !isBusy && setIsCancelOpen(false)}
        title="Cancel appointment?"
      >
        <div className="space-y-4 p-5 sm:p-6">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <p className="text-sm leading-6 text-ink-soft">
            Cancel <span className="font-semibold text-ink">{appointment.serviceName}</span>?
            This action cannot be undone.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              disabled={isBusy}
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
              {cancelMutation.isPending ? "Cancelling…" : "Cancel appointment"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        description={`Change only the date and time. The ${appointment.durationMinutes}-minute duration remains unchanged.`}
        isOpen={isRescheduleOpen}
        onClose={() => !isBusy && setIsRescheduleOpen(false)}
        title="Reschedule appointment"
      >
        <form className="space-y-4 p-5 sm:p-6" onSubmit={submitReschedule}>
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              disabled={isBusy}
              id="reschedule-appointment-date"
              label="Date"
              min={getCurrentLocalDate(appointment.timeZone)}
              onChange={(event) => {
                setScheduledDate(event.target.value);
                setFormError(null);
              }}
              required
              type="date"
              value={scheduledDate}
            />
            <TextField
              disabled={isBusy}
              id="reschedule-appointment-time"
              label="Time"
              onChange={(event) => {
                setScheduledTime(event.target.value);
                setFormError(null);
              }}
              required
              type="time"
              value={scheduledTime}
            />
          </div>
          <p className="rounded-[10px] bg-surface-subtle px-3 py-2 text-xs leading-5 text-muted">
            Times are interpreted in{" "}
            <span className="font-semibold text-ink-soft">
              {appointment.timeZone}
            </span>
            .
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              disabled={isBusy}
              onClick={() => setIsRescheduleOpen(false)}
              variant="secondary"
            >
              Keep current time
            </Button>
            <Button isLoading={rescheduleMutation.isPending} type="submit">
              {rescheduleMutation.isPending ? "Rescheduling…" : "Save new time"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
