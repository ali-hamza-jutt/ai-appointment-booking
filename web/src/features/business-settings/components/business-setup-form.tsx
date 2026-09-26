"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import { BuildingIcon } from "@/components/ui/icons";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { BUSINESS_UI_CONSTANTS } from "@/features/business-settings/constants/business-ui.constants";
import { useActiveBusiness } from "@/features/business-settings/context/active-business-context";
import { CurrencySelect } from "@/features/business-settings/components/currency-select";
import { TimeZoneSelect } from "@/features/business-settings/components/time-zone-select";
import { VerticalPicker } from "@/features/business-settings/components/vertical-picker";
import {
  getListMyBusinessesQueryKey,
  useCreateBusiness,
  useListBusinessVerticals,
} from "@/generated/api/businesses/businesses";
import type { BusinessVertical } from "@/generated/api/models";
import { useBrowserTimeZone } from "@/hooks/use-browser-time-zone";
import { getApiErrorMessage, getApiFieldError } from "@/lib/api/api-error";

export function BusinessSetupForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const browserTimeZone = useBrowserTimeZone();
  const { selectBusiness } = useActiveBusiness();
  const verticalsQuery = useListBusinessVerticals();
  const createMutation = useCreateBusiness();
  const [name, setName] = useState("");
  const [vertical, setVertical] = useState<BusinessVertical | null>(null);
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string>(BUSINESS_UI_CONSTANTS.DEFAULT_CURRENCY);
  const [locationName, setLocationName] = useState("");
  const [address, setAddress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const selectedTimeZone = timeZone ?? browserTimeZone;
  const mutationError = createMutation.error;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (name.trim().length < 2) {
      setFormError("Enter a business name with at least 2 characters.");
      return;
    }

    if (!vertical) {
      setFormError("Choose the type of business you run.");
      return;
    }

    setFormError(null);
    createMutation.mutate(
      {
        data: {
          name,
          vertical,
          timeZone: selectedTimeZone,
          currency,
          ...(locationName.trim()
            ? {
                location: {
                  name: locationName,
                  ...(address.trim() ? { address } : {}),
                },
              }
            : {}),
        },
      },
      {
        onSuccess: async (business) => {
          selectBusiness(business.id);
          await queryClient.invalidateQueries({
            queryKey: getListMyBusinessesQueryKey(),
          });
          router.push("/business/settings");
        },
      },
    );
  }

  return (
    <PageContainer size="narrow">
      <PageHeader
        description="Tell us about your business. You can change these details later."
        title="Set up your business"
      />

      <form noValidate onSubmit={handleSubmit}>
        <SectionCard
          footer={
            <Button
              isLoading={createMutation.isPending}
              leadingIcon={<BuildingIcon className="size-4" />}
              type="submit"
            >
              Create business
            </Button>
          }
          title="Business details"
        >
          <div className="space-y-5">
            {formError || mutationError ? (
              <Alert tone="danger">
                {formError ??
                  getApiErrorMessage(
                    mutationError,
                    "The business could not be created. Please try again.",
                  )}
              </Alert>
            ) : null}

            <TextField
              autoComplete="organization"
              error={getApiFieldError(mutationError, "name")}
              id="business-name"
              label="Business name"
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              placeholder="Glow Hair Studio"
              required
              value={name}
            />

            <VerticalPicker
              isLoading={verticalsQuery.isPending}
              onChange={setVertical}
              value={vertical}
              verticals={verticalsQuery.data?.items ?? []}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <TimeZoneSelect
                error={getApiFieldError(mutationError, "timeZone")}
                id="business-time-zone"
                label="Time zone"
                onChange={(event) => setTimeZone(event.target.value)}
                value={selectedTimeZone}
              />
              <CurrencySelect
                error={getApiFieldError(mutationError, "currency")}
                id="business-currency"
                label="Currency"
                onChange={(event) => setCurrency(event.target.value)}
                value={currency}
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                hint="Defaults to “Main location”."
                id="business-location-name"
                label="First location (optional)"
                maxLength={120}
                onChange={(event) => setLocationName(event.target.value)}
                placeholder="Downtown studio"
                value={locationName}
              />
              <TextField
                disabled={!locationName.trim()}
                id="business-location-address"
                label="Address (optional)"
                maxLength={300}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="12 High Street"
                value={address}
              />
            </div>
          </div>
        </SectionCard>
      </form>
    </PageContainer>
  );
}
