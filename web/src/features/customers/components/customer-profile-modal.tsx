"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { TextAreaField } from "@/components/ui/form-controls";
import { Modal } from "@/components/ui/modal";
import { BOOKING_STATUS_PRESENTATION } from "@/features/bookings/constants/booking-status.constants";
import { CustomerPrivacy } from "@/features/customers/components/customer-privacy";
import { PREFERENCE_UI_CONSTANTS } from "@/features/customers/constants/preference-ui.constants";
import {
  getGetCustomerProfileQueryKey,
  useGetCustomerProfile,
  useUpdateCustomerNotes,
} from "@/generated/api/customers/customers";
import type { CustomerResponse } from "@/generated/api/models";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { formatDateTime } from "@/lib/utils/date-time";

/** A customer's visits, the team's notes and what the booking assistant remembers about them. */
export function CustomerProfileModal({
  businessId,
  customer,
  onClose,
}: {
  businessId: string;
  customer: CustomerResponse;
  onClose: () => void;
}) {
  const profileQuery = useGetCustomerProfile(businessId, customer.id);
  const profile = profileQuery.data;

  return (
    <Modal isOpen onClose={onClose} title={customer.name}>
      <div className="space-y-6 p-5 sm:p-6">
        {profileQuery.isPending ? (
          <div className="space-y-3" role="status">
            <span className="sr-only">Loading customer profile</span>
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
          </div>
        ) : profileQuery.isError ? (
          <Alert tone="danger">
            {getApiErrorMessage(profileQuery.error, "This customer's profile could not be loaded.")}
          </Alert>
        ) : profile ? (
          <>
            <dl className="grid grid-cols-2 gap-3">
              <Stat label="Completed visits" value={profile.completedVisits} />
              <Stat label="No-shows" value={profile.noShows} />
            </dl>

            <CustomerNotes businessId={businessId} customerId={customer.id} notes={profile.notes} />

            <section>
              <h4 className="text-sm font-semibold text-ink">Remembered preferences</h4>
              {profile.preferences.length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  None yet. Preferences come from what the customer tells the assistant and from repeat visits.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                  {profile.preferences.map((preference) => (
                    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5" key={preference.id}>
                      <div>
                        <p className="text-xs font-semibold text-muted">
                          {PREFERENCE_UI_CONSTANTS.KEY_LABELS[preference.key]}
                        </p>
                        <p className="text-sm font-medium text-ink">{preference.label}</p>
                      </div>
                      <Badge tone={preference.source === "CUSTOMER" ? "brand" : "neutral"}>
                        {PREFERENCE_UI_CONSTANTS.STAFF_SOURCE_LABELS[preference.source]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4 className="text-sm font-semibold text-ink">Recent bookings</h4>
              {profile.recentBookings.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No bookings yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                  {profile.recentBookings.map((visit) => {
                    const status = BOOKING_STATUS_PRESENTATION[visit.status];

                    return (
                      <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5" key={visit.bookingId}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">
                            {visit.serviceName}
                            {visit.staffName ? <span className="text-muted"> with {visit.staffName}</span> : null}
                          </p>
                          <p className="text-xs text-muted">{formatDateTime(visit.scheduledAt, visit.timeZone)}</p>
                        </div>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <CustomerPrivacy businessId={businessId} customerId={customer.id} onErased={onClose} />
          </>
        ) : null}
      </div>
    </Modal>
  );
}

/** Private notes for the team; customers and the assistant never see them. */
function CustomerNotes({ businessId, customerId, notes }: { businessId: string; customerId: string; notes: string | null }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(notes ?? "");
  const saveMutation = useUpdateCustomerNotes({
    mutation: {
      onSuccess: (profile) => {
        queryClient.setQueryData(getGetCustomerProfileQueryKey(businessId, customerId), profile);
        setDraft(profile.notes ?? "");
      },
    },
  });
  const isChanged = draft.trim() !== (notes ?? "");

  return (
    <section className="space-y-2">
      <TextAreaField
        hint="Only your team sees these. The customer and the assistant never do."
        id={`customer-notes-${customerId}`}
        label="Team notes"
        maxLength={2_000}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Allergies, preferences, anything worth knowing next time"
        rows={3}
        value={draft}
      />
      {saveMutation.error ? (
        <Alert tone="danger">{getApiErrorMessage(saveMutation.error, "The notes could not be saved.")}</Alert>
      ) : null}
      <Button
        disabled={!isChanged}
        isLoading={saveMutation.isPending}
        onClick={() => saveMutation.mutate({ businessId, customerId, data: { notes: draft.trim() || null } })}
        size="sm"
        variant="secondary"
      >
        Save notes
      </Button>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-subtle px-4 py-3">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-bold text-ink">{value}</dd>
    </div>
  );
}
