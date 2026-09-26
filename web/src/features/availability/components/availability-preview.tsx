"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { SelectField } from "@/components/ui/form-controls";
import { SectionCard } from "@/components/ui/section-card";
import { AVAILABILITY_UI_CONSTANTS } from "@/features/availability/constants/availability-ui.constants";
import type { ServiceResponse } from "@/generated/api/models";
import { useGetPublicAvailability } from "@/generated/api/public-booking/public-booking";
import { getApiErrorMessage } from "@/lib/api/api-error";
import {
  addDaysToDate,
  formatLocalDateLabel,
  getCurrentLocalDate,
} from "@/lib/utils/date-time";

interface AvailabilityPreviewProps {
  businessSlug: string;
  services: ServiceResponse[];
  staffId: string;
  timeZone: string;
}

/** Shows what customers will see for this person over the next week. */
export function AvailabilityPreview({
  businessSlug,
  services,
  staffId,
  timeZone,
}: AvailabilityPreviewProps) {
  const bookable = services.filter((service) => service.isActive && service.onlineBookable);
  const [chosenServiceId, setServiceId] = useState<string | null>(null);
  const serviceId =
    bookable.find((service) => service.id === chosenServiceId)?.id ?? bookable[0]?.id ?? "";
  const from = getCurrentLocalDate(timeZone);
  const to = addDaysToDate(from, AVAILABILITY_UI_CONSTANTS.PREVIEW_DAYS - 1);
  const availabilityQuery = useGetPublicAvailability(
    businessSlug,
    { serviceId, staffId, from, to },
    { query: { enabled: Boolean(serviceId && from) } },
  );

  return (
    <SectionCard
      description="What customers can book with this person in the next 7 days."
      title="Customer preview"
    >
      {bookable.length === 0 ? (
        <p className="text-sm text-muted">Assign an online-bookable service to preview slots.</p>
      ) : (
        <div className="space-y-4">
          <SelectField
            id="preview-service"
            label="Service"
            onChange={(event) => setServiceId(event.target.value)}
            value={serviceId}
          >
            {bookable.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </SelectField>

          {availabilityQuery.isPending ? (
            <Skeleton className="h-24 rounded-[10px]" />
          ) : availabilityQuery.isError ? (
            <Alert tone="danger">
              {getApiErrorMessage(availabilityQuery.error, "Availability could not be loaded.")}
            </Alert>
          ) : availabilityQuery.data.days.length === 0 ? (
            <Alert tone="warning">
              No bookable times this week. Check working hours, time off and service assignments.
            </Alert>
          ) : (
            <ul className="space-y-3">
              {availabilityQuery.data.days.map((day) => (
                <li key={day.date}>
                  <p className="mb-1.5 text-xs font-semibold text-ink">
                    {formatLocalDateLabel(day.date)}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {day.slots
                      .slice(0, AVAILABILITY_UI_CONSTANTS.MAX_PREVIEW_SLOTS_PER_DAY)
                      .map((slot) => (
                        <Badge key={slot.time} tone="brand">
                          {slot.time}
                          {slot.seatsLeft !== null ? ` · ${slot.seatsLeft} left` : ""}
                        </Badge>
                      ))}
                    {day.slots.length > AVAILABILITY_UI_CONSTANTS.MAX_PREVIEW_SLOTS_PER_DAY ? (
                      <Badge tone="neutral">
                        +{day.slots.length - AVAILABILITY_UI_CONSTANTS.MAX_PREVIEW_SLOTS_PER_DAY} more
                      </Badge>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </SectionCard>
  );
}
