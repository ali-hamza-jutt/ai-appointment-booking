"use client";

import { Badge } from "@/components/ui/badge";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { BOOKING_STATUS_PRESENTATION } from "@/features/bookings/constants/booking-status.constants";
import { PREFERENCE_UI_CONSTANTS } from "@/features/customers/constants/preference-ui.constants";
import { useGetCustomerProfile } from "@/generated/api/customers/customers";
import type { CustomerResponse } from "@/generated/api/models";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { formatDateTime } from "@/lib/utils/date-time";

/** A customer's visits and what the booking assistant remembers about them. */
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
          </>
        ) : null}
      </div>
    </Modal>
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
