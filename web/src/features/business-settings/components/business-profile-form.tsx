"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { SelectField, TextField } from "@/components/ui/form-controls";
import { SectionCard } from "@/components/ui/section-card";
import { CurrencySelect } from "@/features/business-settings/components/currency-select";
import { TimeZoneSelect } from "@/features/business-settings/components/time-zone-select";
import {
  getGetBusinessQueryKey,
  getListMyBusinessesQueryKey,
  useListBusinessVerticals,
  useUpdateBusiness,
} from "@/generated/api/businesses/businesses";
import type { BusinessResponse, BusinessVertical } from "@/generated/api/models";
import { getApiErrorMessage, getApiFieldError } from "@/lib/api/api-error";

interface BusinessProfileFormProps {
  business: BusinessResponse;
  canEdit: boolean;
}

export function BusinessProfileForm({ business, canEdit }: BusinessProfileFormProps) {
  const queryClient = useQueryClient();
  const verticalsQuery = useListBusinessVerticals();
  const updateMutation = useUpdateBusiness();
  const [name, setName] = useState(business.name);
  const [slug, setSlug] = useState(business.slug);
  const [vertical, setVertical] = useState<BusinessVertical>(business.vertical);
  const [timeZone, setTimeZone] = useState(business.timeZone);
  const [currency, setCurrency] = useState(business.currency);
  const [saved, setSaved] = useState(false);
  const error = updateMutation.error;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);

    updateMutation.mutate(
      {
        businessId: business.id,
        data: { name, slug, vertical, timeZone, currency },
      },
      {
        onSuccess: (response) => {
          queryClient.setQueryData(getGetBusinessQueryKey(business.id), response);
          void queryClient.invalidateQueries({
            queryKey: getListMyBusinessesQueryKey(),
          });
          setSaved(true);
        },
      },
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <SectionCard
        description="How your business appears to customers."
        footer={
          canEdit ? (
            <Button isLoading={updateMutation.isPending} type="submit">
              Save profile
            </Button>
          ) : null
        }
        title="Business profile"
      >
        <div className="space-y-5">
          {error ? (
            <Alert tone="danger">
              {getApiErrorMessage(error, "The profile could not be saved.")}
            </Alert>
          ) : saved ? (
            <Alert tone="success">Business profile saved.</Alert>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              disabled={!canEdit}
              error={getApiFieldError(error, "name")}
              id="profile-name"
              label="Business name"
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
            <TextField
              disabled={!canEdit}
              error={getApiFieldError(error, "slug")}
              hint="Lowercase letters, numbers and hyphens."
              id="profile-slug"
              label="Booking link"
              maxLength={60}
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
              value={slug}
            />
            <SelectField
              disabled={!canEdit}
              id="profile-vertical"
              label="Business type"
              onChange={(event) => setVertical(event.target.value as BusinessVertical)}
              value={vertical}
            >
              {(verticalsQuery.data?.items ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
              {verticalsQuery.data ? null : <option value={vertical}>{vertical}</option>}
            </SelectField>
            <TimeZoneSelect
              disabled={!canEdit}
              error={getApiFieldError(error, "timeZone")}
              id="profile-time-zone"
              label="Time zone"
              onChange={(event) => setTimeZone(event.target.value)}
              value={timeZone}
            />
            <CurrencySelect
              disabled={!canEdit}
              error={getApiFieldError(error, "currency")}
              id="profile-currency"
              label="Currency"
              onChange={(event) => setCurrency(event.target.value)}
              value={currency}
            />
          </div>
        </div>
      </SectionCard>
    </form>
  );
}
