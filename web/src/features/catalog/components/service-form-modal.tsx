"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/ui/form-controls";
import { Modal } from "@/components/ui/modal";
import {
  BOOKING_TYPE_OPTIONS,
  CATALOG_UI_CONSTANTS,
} from "@/features/catalog/constants/catalog-ui.constants";
import {
  useCreateService,
  useUpdateService,
} from "@/generated/api/catalog/catalog";
import type {
  LocationResponse,
  ServiceBookingType,
  ServiceCategoryResponse,
  ServiceResponse,
} from "@/generated/api/models";
import { getApiErrorMessage, getApiFieldError } from "@/lib/api/api-error";
import { majorInputToMinor, minorToMajorInput } from "@/lib/utils/money";

interface ServiceFormModalProps {
  businessId: string;
  categories: ServiceCategoryResponse[];
  currency: string;
  initialName?: string;
  locations: LocationResponse[];
  onClose: () => void;
  onSaved: (service: ServiceResponse) => void;
  service?: ServiceResponse;
}

type FieldErrors = Partial<
  Record<"name" | "durationMinutes" | "price" | "deposit" | "capacity" | "buffers", string>
>;

function parseWholeNumber(value: string): number | null {
  return /^\d+$/.test(value.trim()) ? Number(value) : null;
}

export function ServiceFormModal({
  businessId,
  categories,
  currency,
  initialName = "",
  locations,
  onClose,
  onSaved,
  service,
}: ServiceFormModalProps) {
  const createMutation = useCreateService();
  const updateMutation = useUpdateService();
  const [name, setName] = useState(service?.name ?? initialName);
  const [description, setDescription] = useState(service?.description ?? "");
  const [categoryId, setCategoryId] = useState(service?.category?.id ?? "");
  const [locationId, setLocationId] = useState(service?.location?.id ?? "");
  const [bookingType, setBookingType] = useState<ServiceBookingType>(
    service?.bookingType ?? "APPOINTMENT",
  );
  const [capacity, setCapacity] = useState(
    String(service?.capacity && service.capacity > 1
      ? service.capacity
      : CATALOG_UI_CONSTANTS.DEFAULT_CLASS_CAPACITY),
  );
  const [duration, setDuration] = useState(
    String(service?.durationMinutes ?? CATALOG_UI_CONSTANTS.DEFAULT_DURATION_MINUTES),
  );
  const [price, setPrice] = useState(
    service ? minorToMajorInput(service.priceMinor, currency) : "",
  );
  const [deposit, setDeposit] = useState(
    service?.depositMinor != null ? minorToMajorInput(service.depositMinor, currency) : "",
  );
  const [bufferBefore, setBufferBefore] = useState(String(service?.bufferBeforeMin ?? 0));
  const [bufferAfter, setBufferAfter] = useState(String(service?.bufferAfterMin ?? 0));
  const [onlineBookable, setOnlineBookable] = useState(service?.onlineBookable ?? true);
  const [isActive, setIsActive] = useState(service?.isActive ?? true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const mutation = service ? updateMutation : createMutation;
  const error = mutation.error;
  const selectedBookingType = BOOKING_TYPE_OPTIONS.find(
    (option) => option.value === bookingType,
  );

  function validate() {
    const errors: FieldErrors = {};
    const durationMinutes = parseWholeNumber(duration);
    const priceMinor = majorInputToMinor(price, currency);
    const depositMinor = deposit.trim() ? majorInputToMinor(deposit, currency) : null;
    const seats = bookingType === "CLASS" ? parseWholeNumber(capacity) : 1;
    const bufferBeforeMin = parseWholeNumber(bufferBefore);
    const bufferAfterMin = parseWholeNumber(bufferAfter);

    if (name.trim().length < 2) errors.name = "Enter a name with at least 2 characters.";
    if (
      durationMinutes === null ||
      durationMinutes < CATALOG_UI_CONSTANTS.MIN_DURATION_MINUTES ||
      durationMinutes > CATALOG_UI_CONSTANTS.MAX_DURATION_MINUTES
    ) {
      errors.durationMinutes = "Enter whole minutes from 5 to 720.";
    }
    if (priceMinor === null) errors.price = "Enter a valid price, for example 25.00.";
    if (deposit.trim() && (depositMinor === null || (priceMinor !== null && depositMinor > priceMinor))) {
      errors.deposit = "Deposit must be a valid amount no higher than the price.";
    }
    if (seats === null || seats < 1 || seats > CATALOG_UI_CONSTANTS.MAX_CLASS_CAPACITY) {
      errors.capacity = "Enter between 1 and 500 seats.";
    }
    if (
      bufferBeforeMin === null ||
      bufferAfterMin === null ||
      bufferBeforeMin > CATALOG_UI_CONSTANTS.MAX_BUFFER_MINUTES ||
      bufferAfterMin > CATALOG_UI_CONSTANTS.MAX_BUFFER_MINUTES
    ) {
      errors.buffers = "Buffers must be whole minutes from 0 to 240.";
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) return null;

    return {
      name,
      description: description.trim() || null,
      categoryId: categoryId || null,
      locationId: locationId || null,
      bookingType,
      capacity: seats ?? 1,
      durationMinutes: durationMinutes ?? 0,
      priceMinor: priceMinor ?? 0,
      depositMinor,
      bufferBeforeMin: bufferBeforeMin ?? 0,
      bufferAfterMin: bufferAfterMin ?? 0,
      onlineBookable,
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const values = validate();

    if (!values) return;

    if (service) {
      updateMutation.mutate(
        { businessId, serviceId: service.id, data: { ...values, isActive } },
        { onSuccess: onSaved },
      );
      return;
    }

    const { categoryId: category, locationId: location, depositMinor, description: text, ...rest } =
      values;

    createMutation.mutate(
      {
        businessId,
        data: {
          ...rest,
          ...(text ? { description: text } : {}),
          ...(category ? { categoryId: category } : {}),
          ...(location ? { locationId: location } : {}),
          ...(depositMinor !== null ? { depositMinor } : {}),
        },
      },
      { onSuccess: onSaved },
    );
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={service ? `Edit ${service.name}` : "Add service"}
    >
      <form className="space-y-5 p-5 sm:p-6" noValidate onSubmit={handleSubmit}>
        {error ? (
          <Alert tone="danger">
            {getApiErrorMessage(error, "The service could not be saved.")}
          </Alert>
        ) : null}

        <TextField
          error={fieldErrors.name ?? getApiFieldError(error, "name")}
          id="service-name"
          label="Service name"
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          value={name}
        />

        <SelectField
          hint={selectedBookingType?.description}
          id="service-booking-type"
          label="Booking type"
          onChange={(event) => setBookingType(event.target.value as ServiceBookingType)}
          value={bookingType}
        >
          {BOOKING_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            error={fieldErrors.durationMinutes ?? getApiFieldError(error, "durationMinutes")}
            id="service-duration"
            inputMode="numeric"
            label="Duration (minutes)"
            onChange={(event) => setDuration(event.target.value)}
            value={duration}
          />
          {bookingType === "CLASS" ? (
            <TextField
              error={fieldErrors.capacity ?? getApiFieldError(error, "capacity")}
              id="service-capacity"
              inputMode="numeric"
              label="Seats per class"
              onChange={(event) => setCapacity(event.target.value)}
              value={capacity}
            />
          ) : null}
          <TextField
            error={fieldErrors.price ?? getApiFieldError(error, "priceMinor")}
            id="service-price"
            inputMode="decimal"
            label={`Price (${currency})`}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="0.00"
            value={price}
          />
          <TextField
            error={fieldErrors.deposit ?? getApiFieldError(error, "depositMinor")}
            hint="Collected when payments are enabled."
            id="service-deposit"
            inputMode="decimal"
            label={`Deposit (${currency}, optional)`}
            onChange={(event) => setDeposit(event.target.value)}
            value={deposit}
          />
          <TextField
            error={fieldErrors.buffers}
            hint="Preparation time blocked before the start."
            id="service-buffer-before"
            inputMode="numeric"
            label="Buffer before (minutes)"
            onChange={(event) => setBufferBefore(event.target.value)}
            value={bufferBefore}
          />
          <TextField
            hint="Clean-up time blocked after the end."
            id="service-buffer-after"
            inputMode="numeric"
            label="Buffer after (minutes)"
            onChange={(event) => setBufferAfter(event.target.value)}
            value={bufferAfter}
          />
          <SelectField
            id="service-category"
            label="Category"
            onChange={(event) => setCategoryId(event.target.value)}
            value={categoryId}
          >
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="service-location"
            label="Location"
            onChange={(event) => setLocationId(event.target.value)}
            value={locationId}
          >
            <option value="">All locations</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </SelectField>
        </div>

        <TextAreaField
          id="service-description"
          label="Description (optional)"
          maxLength={2000}
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />

        <CheckboxField
          checked={onlineBookable}
          hint="Show this service on your booking page and to the booking assistant."
          id="service-online-bookable"
          label="Customers can book online"
          onChange={(event) => setOnlineBookable(event.target.checked)}
        />

        {service ? (
          <CheckboxField
            checked={isActive}
            hint="Archived services are hidden everywhere but keep their booking history."
            id="service-active"
            label="Service is active"
            onChange={(event) => setIsActive(event.target.checked)}
          />
        ) : null}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} type="submit">
            {service ? "Save service" : "Add service"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
