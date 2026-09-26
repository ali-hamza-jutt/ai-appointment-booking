"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import {
  CheckboxField,
  CheckboxList,
  SelectField,
  TextField,
} from "@/components/ui/form-controls";
import { Modal } from "@/components/ui/modal";
import type {
  LocationResponse,
  ResourceResponse,
  ServiceResponse,
} from "@/generated/api/models";
import { useCreateResource, useUpdateResource } from "@/generated/api/staff/staff";
import { getApiErrorMessage, getApiFieldError } from "@/lib/api/api-error";

interface ResourceFormModalProps {
  businessId: string;
  locations: LocationResponse[];
  onClose: () => void;
  onSaved: () => void;
  resource?: ResourceResponse;
  services: ServiceResponse[];
}

export function ResourceFormModal({
  businessId,
  locations,
  onClose,
  onSaved,
  resource,
  services,
}: ResourceFormModalProps) {
  const createMutation = useCreateResource();
  const updateMutation = useUpdateResource();
  const [name, setName] = useState(resource?.name ?? "");
  const [locationId, setLocationId] = useState(
    resource?.location.id ?? locations[0]?.id ?? "",
  );
  const [capacity, setCapacity] = useState(String(resource?.capacity ?? 1));
  const [serviceIds, setServiceIds] = useState<string[]>(
    resource?.services.map((service) => service.id) ?? [],
  );
  const [isActive, setIsActive] = useState(resource?.isActive ?? true);
  const [capacityError, setCapacityError] = useState<string>();
  const mutation = resource ? updateMutation : createMutation;
  const error = mutation.error;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const seats = Number(capacity);

    if (!Number.isInteger(seats) || seats < 1 || seats > 500) {
      setCapacityError("Enter a whole number from 1 to 500.");
      return;
    }

    setCapacityError(undefined);

    if (resource) {
      updateMutation.mutate(
        {
          businessId,
          resourceId: resource.id,
          data: { name, locationId, capacity: seats, serviceIds, isActive },
        },
        { onSuccess: onSaved },
      );
      return;
    }

    createMutation.mutate(
      { businessId, data: { name, locationId, capacity: seats, serviceIds } },
      { onSuccess: onSaved },
    );
  }

  return (
    <Modal
      description="Rooms, chairs or equipment that a service cannot run without."
      isOpen
      onClose={onClose}
      title={resource ? `Edit ${resource.name}` : "Add resource"}
    >
      <form className="space-y-5 p-5 sm:p-6" noValidate onSubmit={handleSubmit}>
        {error ? (
          <Alert tone="danger">
            {getApiErrorMessage(error, "The resource could not be saved.")}
          </Alert>
        ) : null}
        <TextField
          error={getApiFieldError(error, "name")}
          id="resource-name"
          label="Name"
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          placeholder="Treatment room 1"
          value={name}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            id="resource-location"
            label="Location"
            onChange={(event) => setLocationId(event.target.value)}
            value={locationId}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </SelectField>
          <TextField
            error={capacityError ?? getApiFieldError(error, "capacity")}
            hint="Bookings that can use it at the same time."
            id="resource-capacity"
            inputMode="numeric"
            label="Capacity"
            onChange={(event) => setCapacity(event.target.value)}
            value={capacity}
          />
        </div>
        <CheckboxList
          emptyMessage="Add services first to link them."
          id="resource-services"
          label="Required by services"
          onChange={setServiceIds}
          options={services.map((service) => ({ value: service.id, label: service.name }))}
          values={serviceIds}
        />
        {resource ? (
          <CheckboxField
            checked={isActive}
            id="resource-active"
            label="Resource is available"
            onChange={(event) => setIsActive(event.target.checked)}
          />
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} type="submit">
            {resource ? "Save resource" : "Add resource"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
