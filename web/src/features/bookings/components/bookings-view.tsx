"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { SelectField, TextField } from "@/components/ui/form-controls";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarIcon,
  PlusIcon,
} from "@/components/ui/icons";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { BusinessRequired } from "@/features/business-settings/components/business-required";
import { BookingDetailModal } from "@/features/bookings/components/booking-detail-modal";
import { BookingLinkCard } from "@/features/bookings/components/booking-link-card";
import { ManualBookingModal } from "@/features/bookings/components/manual-booking-modal";
import { BOOKING_STATUS_PRESENTATION } from "@/features/bookings/constants/booking-status.constants";
import { useBookingActions } from "@/features/bookings/hooks/use-booking-actions";
import { useDayBookings } from "@/features/bookings/hooks/use-day-bookings";
import {
  BOOKING_ACTION_LABELS,
  formatBookingPrice,
  formatTimeRange,
  getAvailableActions,
} from "@/features/bookings/utils/booking-format";
import { getListBookingsQueryKey } from "@/generated/api/bookings/bookings";
import { useGetBusiness } from "@/generated/api/businesses/businesses";
import { useListServices } from "@/generated/api/catalog/catalog";
import type {
  BookingResponse,
  BookingStatus,
  BusinessResponse,
  BusinessSummaryResponse,
} from "@/generated/api/models";
import { useListStaff } from "@/generated/api/staff/staff";
import { getApiErrorMessage } from "@/lib/api/api-error";
import {
  addDaysToDate,
  formatLocalDateLabel,
  getCurrentLocalDate,
} from "@/lib/utils/date-time";

const STATUS_FILTERS: ReadonlyArray<BookingStatus | "ALL"> = [
  "ALL",
  "CONFIRMED",
  "PENDING",
  "CHECKED_IN",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];

export function BookingsView() {
  return (
    <BusinessRequired>
      {(business) => <BookingsLoader summary={business} />}
    </BusinessRequired>
  );
}

function BookingsLoader({ summary }: { summary: BusinessSummaryResponse }) {
  const businessQuery = useGetBusiness(summary.id);

  if (businessQuery.isPending) {
    return (
      <PageContainer>
        <Skeleton className="h-96 rounded-xl" />
      </PageContainer>
    );
  }

  if (businessQuery.isError) {
    return (
      <PageContainer>
        <Alert tone="danger">
          {getApiErrorMessage(businessQuery.error, "Bookings could not be loaded.")}
        </Alert>
      </PageContainer>
    );
  }

  return <BookingsContent business={businessQuery.data} />;
}

function BookingsContent({ business }: { business: BusinessResponse }) {
  const queryClient = useQueryClient();
  const timeZone = business.timeZone;
  const [date, setDate] = useState(() => getCurrentLocalDate(timeZone));
  const [status, setStatus] = useState<BookingStatus | "ALL">("ALL");
  const [selected, setSelected] = useState<BookingResponse | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const bookingsQuery = useDayBookings(business.id, date, timeZone, status);
  const servicesQuery = useListServices(business.id);
  const staffQuery = useListStaff(business.id);
  const actions = useBookingActions(business.id, business.slug);
  const bookings = bookingsQuery.data?.items ?? [];
  const activeServices = (servicesQuery.data?.items ?? []).filter((service) => service.isActive);
  const now = new Date();

  return (
    <PageContainer size="wide">
      <PageHeader
        actions={
          <Button
            disabled={activeServices.length === 0}
            leadingIcon={<PlusIcon className="size-4" />}
            onClick={() => setIsCreating(true)}
          >
            New booking
          </Button>
        }
        description={`Times are in ${timeZone.replaceAll("_", " ")}.`}
        title="Bookings"
      />

      <BookingLinkCard slug={business.slug} />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1">
          <Button
            aria-label="Previous day"
            onClick={() => setDate((current) => addDaysToDate(current, -1))}
            size="sm"
            variant="secondary"
          >
            <ArrowLeftIcon className="size-4" />
          </Button>
          <Button onClick={() => setDate(getCurrentLocalDate(timeZone))} size="sm" variant="secondary">
            Today
          </Button>
          <Button
            aria-label="Next day"
            onClick={() => setDate((current) => addDaysToDate(current, 1))}
            size="sm"
            variant="secondary"
          >
            <ArrowRightIcon className="size-4" />
          </Button>
        </div>
        <div className="w-44">
          <TextField
            hideLabel
            id="bookings-date"
            label="Date"
            onChange={(event) => event.target.value && setDate(event.target.value)}
            type="date"
            value={date}
          />
        </div>
        <div className="w-48">
          <SelectField
            hideLabel
            id="bookings-status"
            label="Status"
            onChange={(event) => setStatus(event.target.value as BookingStatus | "ALL")}
            value={status}
          >
            {STATUS_FILTERS.map((value) => (
              <option key={value} value={value}>
                {value === "ALL" ? "All statuses" : BOOKING_STATUS_PRESENTATION[value].label}
              </option>
            ))}
          </SelectField>
        </div>
        <p className="ml-auto text-sm font-semibold text-ink">{formatLocalDateLabel(date)}</p>
      </div>

      {actions.error ? (
        <Alert className="mb-4" tone="danger">
          {getApiErrorMessage(actions.error, "The booking could not be updated.")}
        </Alert>
      ) : null}

      {bookingsQuery.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : bookingsQuery.isError ? (
        <Alert tone="danger">
          {getApiErrorMessage(bookingsQuery.error, "Bookings could not be loaded.")}
        </Alert>
      ) : bookings.length === 0 ? (
        <EmptyState
          description="Bookings made online, through the assistant or by your team appear here."
          icon={CalendarIcon}
          title="No bookings on this day"
        />
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
          {bookings.map((booking) => {
            const presentation = BOOKING_STATUS_PRESENTATION[booking.status];
            const price = formatBookingPrice(booking);

            return (
              <li
                className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
                key={booking.id}
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-4 text-left"
                  onClick={() => setSelected(booking)}
                  type="button"
                >
                  <span className="w-40 shrink-0 text-sm font-semibold text-ink">
                    {formatTimeRange(booking, timeZone)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {booking.customer.name}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {booking.serviceName}
                      {booking.staff ? ` · ${booking.staff.name}` : ""}
                      {price ? ` · ${price}` : ""}
                    </span>
                  </span>
                </button>
                <Badge tone={presentation.tone}>{presentation.label}</Badge>
                <div className="flex gap-1">
                  {getAvailableActions(booking, now).map((action) => (
                    <Button
                      disabled={actions.isPending}
                      key={action}
                      onClick={() => actions.run(action, booking.id)}
                      size="sm"
                      variant={action === "DECLINE" || action === "NO_SHOW" ? "ghost" : "secondary"}
                    >
                      {BOOKING_ACTION_LABELS[action]}
                    </Button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isCreating ? (
        <ManualBookingModal
          businessId={business.id}
          initialDate={date}
          onClose={() => setIsCreating(false)}
          onCreated={() => {
            actions.refresh();
            setIsCreating(false);
          }}
          services={activeServices}
          staff={staffQuery.data?.items ?? []}
          timeZone={timeZone}
        />
      ) : null}

      {selected ? (
        <BookingDetailModal
          booking={selected}
          businessId={business.id}
          businessSlug={business.slug}
          onClose={() => {
            setSelected(null);
            void queryClient.invalidateQueries({
              queryKey: getListBookingsQueryKey(business.id),
            });
          }}
          timeZone={timeZone}
        />
      ) : null}
    </PageContainer>
  );
}
