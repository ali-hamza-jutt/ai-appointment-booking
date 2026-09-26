"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { CheckboxField, TextField } from "@/components/ui/form-controls";
import { SectionCard } from "@/components/ui/section-card";
import {
  POLICY_FIELDS,
  type PolicyFieldDefinition,
} from "@/features/business-settings/constants/business-ui.constants";
import {
  getGetBusinessQueryKey,
  useUpdateBusinessSettings,
} from "@/generated/api/businesses/businesses";
import type { BusinessResponse } from "@/generated/api/models";
import { getApiErrorMessage } from "@/lib/api/api-error";

interface BookingPoliciesFormProps {
  business: BusinessResponse;
  canEdit: boolean;
}

type PolicyValues = Record<PolicyFieldDefinition["key"], string>;

function toPolicyValues(business: BusinessResponse): PolicyValues {
  return Object.fromEntries(
    POLICY_FIELDS.map((field) => [field.key, String(business.settings[field.key])]),
  ) as PolicyValues;
}

export function BookingPoliciesForm({ business, canEdit }: BookingPoliciesFormProps) {
  const queryClient = useQueryClient();
  const updateMutation = useUpdateBusinessSettings();
  const [values, setValues] = useState<PolicyValues>(() => toPolicyValues(business));
  const [allowGuestBooking, setAllowGuestBooking] = useState(
    business.settings.allowGuestBooking,
  );
  const [autoConfirmBookings, setAutoConfirmBookings] = useState(
    business.settings.autoConfirmBookings,
  );
  const [fieldErrors, setFieldErrors] = useState<Partial<PolicyValues>>({});
  const [saved, setSaved] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);

    const errors: Partial<PolicyValues> = {};
    const numbers = Object.fromEntries(
      POLICY_FIELDS.map((field) => {
        const value = Number(values[field.key]);

        if (!Number.isInteger(value) || value < field.min || value > field.max) {
          errors[field.key] = `Enter a whole number from ${field.min} to ${field.max}.`;
        }

        return [field.key, value];
      }),
    ) as Record<PolicyFieldDefinition["key"], number>;

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    updateMutation.mutate(
      {
        businessId: business.id,
        data: { ...numbers, allowGuestBooking, autoConfirmBookings },
      },
      {
        onSuccess: (response) => {
          queryClient.setQueryData(getGetBusinessQueryKey(business.id), response);
          setSaved(true);
        },
      },
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <SectionCard
        description="Rules applied to every booking unless a service overrides them."
        footer={
          canEdit ? (
            <Button isLoading={updateMutation.isPending} type="submit">
              Save policies
            </Button>
          ) : null
        }
        title="Booking policies"
      >
        <div className="space-y-5">
          {updateMutation.error ? (
            <Alert tone="danger">
              {getApiErrorMessage(updateMutation.error, "Policies could not be saved.")}
            </Alert>
          ) : saved ? (
            <Alert tone="success">Booking policies saved.</Alert>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            {POLICY_FIELDS.map((field) => (
              <TextField
                disabled={!canEdit}
                error={fieldErrors[field.key]}
                hint={field.hint}
                id={`policy-${field.key}`}
                inputMode="numeric"
                key={field.key}
                label={field.label}
                max={field.max}
                min={field.min}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field.key]: event.target.value }))
                }
                type="number"
                value={values[field.key]}
              />
            ))}
          </div>

          <div className="space-y-4 border-t border-border pt-5">
            <CheckboxField
              checked={allowGuestBooking}
              disabled={!canEdit}
              hint="Customers can book without creating an account."
              id="policy-allow-guest-booking"
              label="Allow guest booking"
              onChange={(event) => setAllowGuestBooking(event.target.checked)}
            />
            <CheckboxField
              checked={autoConfirmBookings}
              disabled={!canEdit}
              hint="New bookings are confirmed without staff review."
              id="policy-auto-confirm"
              label="Confirm bookings automatically"
              onChange={(event) => setAutoConfirmBookings(event.target.checked)}
            />
          </div>
        </div>
      </SectionCard>
    </form>
  );
}
