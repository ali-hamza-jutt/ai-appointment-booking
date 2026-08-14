import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import {
  TextAreaField,
  TextField,
} from "@/components/ui/form-controls";
import { Modal } from "@/components/ui/modal";
import type { StructuredBookingFormValues } from "@/features/booking/types/booking-ui";
import {
  getCurrentLocalDate,
  toStructuredBookingFormValues,
} from "@/features/booking/utils/booking-format";
import type { AppointmentBookingContext } from "@/generated/api/models";

const MIN_SERVICE_NAME_LENGTH = 2;
const MAX_SERVICE_NAME_LENGTH = 120;
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 480;
const MAX_NOTES_LENGTH = 2000;

type StructuredBookingField = keyof StructuredBookingFormValues;
type StructuredBookingFormErrors = Partial<
  Record<StructuredBookingField, string>
>;

interface StructuredBookingFormProps {
  bookingContext: AppointmentBookingContext | null;
  initialValues?: StructuredBookingFormValues;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: StructuredBookingFormValues) => Promise<boolean>;
  submissionError?: string | null;
  timeZone: string;
}

export function StructuredBookingForm({
  bookingContext,
  initialValues,
  isSubmitting,
  onClose,
  onSubmit,
  submissionError,
  timeZone,
}: StructuredBookingFormProps) {
  const [values, setValues] = useState<StructuredBookingFormValues>(() =>
    initialValues ?? toStructuredBookingFormValues(bookingContext, timeZone),
  );
  const [errors, setErrors] = useState<StructuredBookingFormErrors>({});

  function updateField<Field extends StructuredBookingField>(
    field: Field,
    value: StructuredBookingFormValues[Field],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) return;

    const normalizedValues: StructuredBookingFormValues = {
      durationMinutes: values.durationMinutes,
      ...(values.notes?.trim() ? { notes: values.notes.trim() } : {}),
      scheduledDate: values.scheduledDate,
      scheduledTime: values.scheduledTime,
      serviceName: values.serviceName.trim(),
    };
    const nextErrors = validateValues(normalizedValues);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const succeeded = await onSubmit(normalizedValues);

    if (succeeded) onClose();
  }

  return (
    <Modal
      description="Enter the appointment details directly when chatting is unclear."
      isOpen
      onClose={() => !isSubmitting && onClose()}
      title="Complete booking details"
    >
      <form className="space-y-4 p-5 sm:p-6" onSubmit={handleSubmit}>
        {submissionError ? (
          <Alert tone="danger">{submissionError}</Alert>
        ) : null}

        <TextField
          autoComplete="off"
          disabled={isSubmitting}
          error={errors.serviceName}
          id="structured-booking-service"
          label="Service"
          maxLength={MAX_SERVICE_NAME_LENGTH}
          onChange={(event) => updateField("serviceName", event.target.value)}
          placeholder="Example: System design consultation"
          required
          value={values.serviceName}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            disabled={isSubmitting}
            error={errors.scheduledDate}
            id="structured-booking-date"
            label="Date"
            min={getCurrentLocalDate(timeZone)}
            onChange={(event) =>
              updateField("scheduledDate", event.target.value)
            }
            required
            type="date"
            value={values.scheduledDate}
          />
          <TextField
            disabled={isSubmitting}
            error={errors.scheduledTime}
            id="structured-booking-time"
            label="Time"
            onChange={(event) =>
              updateField("scheduledTime", event.target.value)
            }
            required
            type="time"
            value={values.scheduledTime}
          />
        </div>

        <TextField
          disabled={isSubmitting}
          error={errors.durationMinutes}
          id="structured-booking-duration"
          label="Duration (minutes)"
          max={MAX_DURATION_MINUTES}
          min={MIN_DURATION_MINUTES}
          onChange={(event) =>
            updateField("durationMinutes", Number(event.target.value))
          }
          required
          step={1}
          type="number"
          value={values.durationMinutes}
        />

        <TextAreaField
          disabled={isSubmitting}
          error={errors.notes}
          hint="Optional"
          id="structured-booking-notes"
          label="Notes"
          maxLength={MAX_NOTES_LENGTH}
          onChange={(event) => updateField("notes", event.target.value)}
          placeholder="Add anything the appointment should include"
          rows={3}
          value={values.notes ?? ""}
        />

        <p className="rounded-[10px] bg-surface-subtle px-3 py-2 text-xs leading-5 text-muted">
          Times are interpreted in <span className="font-semibold text-ink-soft">{timeZone}</span>.
        </p>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            disabled={isSubmitting}
            onClick={onClose}
            variant="secondary"
          >
            Cancel
          </Button>
          <Button isLoading={isSubmitting} type="submit">
            {isSubmitting ? "Saving details…" : "Use these details"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function validateValues(
  values: StructuredBookingFormValues,
): StructuredBookingFormErrors {
  const errors: StructuredBookingFormErrors = {};

  if (
    values.serviceName.length < MIN_SERVICE_NAME_LENGTH ||
    values.serviceName.length > MAX_SERVICE_NAME_LENGTH
  ) {
    errors.serviceName = "Enter a service name between 2 and 120 characters.";
  }

  if (!values.scheduledDate) {
    errors.scheduledDate = "Select an appointment date.";
  }

  if (!values.scheduledTime) {
    errors.scheduledTime = "Select an appointment time.";
  }

  if (values.scheduledDate && values.scheduledTime) {
    const scheduledAt = new Date(
      `${values.scheduledDate}T${values.scheduledTime}:00`,
    );

    if (
      Number.isNaN(scheduledAt.getTime()) ||
      scheduledAt.getTime() <= Date.now()
    ) {
      errors.scheduledDate = "Choose a future date and time.";
      errors.scheduledTime = "Choose a future date and time.";
    }
  }

  if (
    !Number.isInteger(values.durationMinutes) ||
    values.durationMinutes < MIN_DURATION_MINUTES ||
    values.durationMinutes > MAX_DURATION_MINUTES
  ) {
    errors.durationMinutes = "Enter a whole number between 5 and 480.";
  }

  if ((values.notes?.length ?? 0) > MAX_NOTES_LENGTH) {
    errors.notes = "Notes cannot exceed 2000 characters.";
  }

  return errors;
}
