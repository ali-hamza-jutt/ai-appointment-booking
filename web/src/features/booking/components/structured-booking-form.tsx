import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { SelectField, TextAreaField } from "@/components/ui/form-controls";
import { Modal } from "@/components/ui/modal";
import { SlotPicker } from "@/features/availability/components/slot-picker";
import { usePublicDaySlots } from "@/features/availability/hooks/use-day-slots";
import type { StructuredBookingFormValues } from "@/features/booking/types/booking-ui";
import { toStructuredBookingFormValues } from "@/features/booking/utils/booking-format";
import { formatDuration } from "@/features/catalog/utils/catalog-format";
import type { AvailableSlot, ChatBookingDraft } from "@/generated/api/models";
import {
  useListPublicServices,
  useListPublicStaff,
} from "@/generated/api/public-booking/public-booking";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { getCurrentLocalDate } from "@/lib/utils/date-time";
import { formatMoney } from "@/lib/utils/money";

const MAX_NOTES_LENGTH = 2000;

interface StructuredBookingFormProps {
  draft: ChatBookingDraft | null;
  businessSlug: string;
  initialValues?: StructuredBookingFormValues;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: StructuredBookingFormValues) => Promise<boolean>;
  submissionError?: string | null;
  timeZone: string;
}

export function StructuredBookingForm({
  draft,
  businessSlug,
  initialValues,
  isSubmitting,
  onClose,
  onSubmit,
  submissionError,
  timeZone,
}: StructuredBookingFormProps) {
  const initial = initialValues ?? toStructuredBookingFormValues(draft, timeZone);
  const servicesQuery = useListPublicServices(businessSlug);
  const [chosenServiceId, setServiceId] = useState(initial.serviceId);
  const [staffId, setStaffId] = useState(initial.staffId ?? "");
  const [date, setDate] = useState(initial.scheduledDate);
  const [slot, setSlot] = useState<AvailableSlot | null>(null);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const services = servicesQuery.data?.items ?? [];
  const serviceId =
    services.find((service) => service.id === chosenServiceId)?.id ?? services[0]?.id ?? "";
  const staffQuery = useListPublicStaff(
    businessSlug,
    { serviceId },
    { query: { enabled: Boolean(serviceId) } },
  );
  const daySlots = usePublicDaySlots(businessSlug, {
    date,
    serviceId,
    timeZone,
    ...(staffId ? { staffId } : {}),
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) return;

    if (!serviceId || !date || !slot) {
      setFormError("Choose a service, a date and an open time.");
      return;
    }

    if (notes.length > MAX_NOTES_LENGTH) {
      setFormError("Notes cannot exceed 2000 characters.");
      return;
    }

    setFormError(null);

    const succeeded = await onSubmit({
      serviceId,
      scheduledDate: date,
      scheduledTime: slot.time,
      ...(staffId ? { staffId } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });

    if (succeeded) onClose();
  }

  return (
    <Modal
      description="Pick a service and one of the open times."
      isOpen
      onClose={onClose}
      title="Booking form"
    >
      <form className="space-y-5 p-5 sm:p-6" noValidate onSubmit={handleSubmit}>
        {formError || submissionError ? (
          <Alert tone="danger">{formError ?? submissionError}</Alert>
        ) : null}

        {servicesQuery.isPending ? (
          <Skeleton className="h-16 rounded-[10px]" />
        ) : servicesQuery.isError ? (
          <Alert tone="danger">
            {getApiErrorMessage(servicesQuery.error, "Services could not be loaded.")}
          </Alert>
        ) : services.length === 0 ? (
          <Alert tone="warning">This business has no services open for online booking yet.</Alert>
        ) : (
          <>
            <SelectField
              id="booking-form-service"
              label="Service"
              onChange={(event) => {
                setServiceId(event.target.value);
                setStaffId("");
                setSlot(null);
              }}
              value={serviceId}
            >
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · {formatDuration(service.durationMinutes)} ·{" "}
                  {formatMoney(service.priceMinor, service.currency)}
                </option>
              ))}
            </SelectField>

            <SelectField
              id="booking-form-staff"
              label="With"
              onChange={(event) => {
                setStaffId(event.target.value);
                setSlot(null);
              }}
              value={staffId}
            >
              <option value="">Anyone available</option>
              {(staffQuery.data?.items ?? []).map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </SelectField>

            <SlotPicker
              date={date}
              error={daySlots.error}
              idPrefix="booking-form"
              isLoading={daySlots.isLoading}
              minDate={getCurrentLocalDate(timeZone)}
              onDateChange={(value) => {
                setDate(value);
                setSlot(null);
              }}
              onSelect={setSlot}
              selectedStartsAt={slot ? String(slot.startsAt) : null}
              slots={daySlots.slots}
              timeZone={timeZone}
            />
          </>
        )}

        <TextAreaField
          id="booking-form-notes"
          label="Notes (optional)"
          maxLength={MAX_NOTES_LENGTH}
          onChange={(event) => setNotes(event.target.value)}
          value={notes}
        />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={isSubmitting} onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button disabled={!slot} isLoading={isSubmitting} type="submit">
            Hold this time
          </Button>
        </div>
      </form>
    </Modal>
  );
}
