"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import { MapPinIcon, PlusIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { SectionCard } from "@/components/ui/section-card";
import { TimeZoneSelect } from "@/features/business-settings/components/time-zone-select";
import {
  getListLocationsQueryKey,
  useCreateLocation,
  useListLocations,
  useUpdateLocation,
} from "@/generated/api/businesses/businesses";
import type { BusinessResponse, LocationResponse } from "@/generated/api/models";
import { getApiErrorMessage, getApiFieldError } from "@/lib/api/api-error";

interface LocationsPanelProps {
  business: BusinessResponse;
  canEdit: boolean;
}

export function LocationsPanel({ business, canEdit }: LocationsPanelProps) {
  const queryClient = useQueryClient();
  const locationsQuery = useListLocations(business.id);
  const updateMutation = useUpdateLocation();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const locations = locationsQuery.data?.items ?? [];

  function refreshLocations() {
    void queryClient.invalidateQueries({
      queryKey: getListLocationsQueryKey(business.id),
    });
  }

  function toggleLocation(location: LocationResponse) {
    updateMutation.mutate(
      {
        businessId: business.id,
        locationId: location.id,
        data: { isActive: !location.isActive },
      },
      { onSuccess: refreshLocations },
    );
  }

  return (
    <SectionCard
      actions={
        canEdit ? (
          <Button
            leadingIcon={<PlusIcon className="size-4" />}
            onClick={() => setIsAddOpen(true)}
            size="sm"
            variant="secondary"
          >
            Add location
          </Button>
        ) : null
      }
      description="Places where customers visit you."
      title="Locations"
    >
      {updateMutation.error ? (
        <Alert className="mb-4" tone="danger">
          {getApiErrorMessage(updateMutation.error, "The location could not be updated.")}
        </Alert>
      ) : null}

      {locationsQuery.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-14 rounded-[10px]" />
          <Skeleton className="h-14 rounded-[10px]" />
        </div>
      ) : locationsQuery.isError ? (
        <Alert tone="danger">
          {getApiErrorMessage(locationsQuery.error, "Locations could not be loaded.")}
        </Alert>
      ) : (
        <ul className="divide-y divide-border">
          {locations.map((location) => (
            <li className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0" key={location.id}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand">
                <MapPinIcon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{location.name}</p>
                <p className="truncate text-xs text-muted">
                  {location.address ?? "No address"} · {location.timeZone.replaceAll("_", " ")}
                </p>
              </div>
              <Badge tone={location.isActive ? "success" : "neutral"}>
                {location.isActive ? "Active" : "Inactive"}
              </Badge>
              {canEdit ? (
                <Button
                  disabled={updateMutation.isPending}
                  onClick={() => toggleLocation(location)}
                  size="sm"
                  variant="ghost"
                >
                  {location.isActive ? "Deactivate" : "Activate"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {isAddOpen ? (
        <AddLocationModal
          business={business}
          onClose={() => setIsAddOpen(false)}
          onCreated={() => {
            refreshLocations();
            setIsAddOpen(false);
          }}
        />
      ) : null}
    </SectionCard>
  );
}

function AddLocationModal({
  business,
  onClose,
  onCreated,
}: {
  business: BusinessResponse;
  onClose: () => void;
  onCreated: () => void;
}) {
  const createMutation = useCreateLocation();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [timeZone, setTimeZone] = useState(business.timeZone);
  const error = createMutation.error;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    createMutation.mutate(
      {
        businessId: business.id,
        data: { name, timeZone, ...(address.trim() ? { address } : {}) },
      },
      { onSuccess: onCreated },
    );
  }

  return (
    <Modal isOpen onClose={onClose} title="Add location">
      <form className="space-y-5 p-5 sm:p-6" noValidate onSubmit={handleSubmit}>
        {error ? (
          <Alert tone="danger">
            {getApiErrorMessage(error, "The location could not be created.")}
          </Alert>
        ) : null}
        <TextField
          error={getApiFieldError(error, "name")}
          id="location-name"
          label="Location name"
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
        <TextField
          error={getApiFieldError(error, "address")}
          id="location-address"
          label="Address (optional)"
          maxLength={300}
          onChange={(event) => setAddress(event.target.value)}
          value={address}
        />
        <TimeZoneSelect
          id="location-time-zone"
          label="Time zone"
          onChange={(event) => setTimeZone(event.target.value)}
          value={timeZone}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button isLoading={createMutation.isPending} type="submit">
            Add location
          </Button>
        </div>
      </form>
    </Modal>
  );
}
