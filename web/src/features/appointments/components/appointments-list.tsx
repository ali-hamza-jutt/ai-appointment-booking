"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Tabs } from "@/components/ui/tabs";
import {
  CalendarIcon,
  ClockIcon,
  PlusIcon,
  RefreshIcon,
} from "@/components/ui/icons";
import { APPOINTMENT_UI_CONSTANTS } from "@/features/appointments/constants/appointment-ui.constants";
import { useAppointments } from "@/features/appointments/hooks/use-appointments";
import type { AppointmentFilter } from "@/features/appointments/types/appointment-ui";
import { toAppointmentViewModel } from "@/features/appointments/utils/appointment-format";
import { getApiErrorMessage } from "@/lib/api/api-error";

export function AppointmentsList() {
  const [activeFilter, setActiveFilter] = useState<AppointmentFilter>("ALL");
  const appointmentsQuery = useAppointments(activeFilter);
  const appointments = Array.from(
    new Map(
      (appointmentsQuery.data?.pages.flatMap((page) => page.items) ?? []).map(
        (appointment) => [appointment.id, appointment],
      ),
    ).values(),
  ).map((appointment) => toAppointmentViewModel(appointment));

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-ink">Your appointments</h2>
          <p className="mt-1 text-sm text-muted">View booking details and upcoming plans.</p>
        </div>
        <LinkButton href="/book?new=true" leadingIcon={<PlusIcon className="size-4" />}>
          Book an appointment
        </LinkButton>
      </div>

      <Tabs
        ariaLabel="Filter appointments by status"
        controls="appointment-results"
        onChange={setActiveFilter}
        options={APPOINTMENT_UI_CONSTANTS.FILTERS}
        value={activeFilter}
      />

      <section id="appointment-results" role="tabpanel">
        {appointmentsQuery.isPending ? (
          <AppointmentListSkeleton />
        ) : appointmentsQuery.isError && appointments.length === 0 ? (
          <AppointmentListError
            message={getApiErrorMessage(
              appointmentsQuery.error,
              "Appointments could not be loaded. Please try again.",
            )}
            onRetry={() => void appointmentsQuery.refetch()}
          />
        ) : appointments.length > 0 ? (
          <>
            {appointmentsQuery.isError ? (
              <Alert className="mb-4" tone="danger">
                Additional appointments could not be loaded. You can retry below.
              </Alert>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              {appointments.map((appointment) => (
                <Link
                  className="group rounded-xl border border-border bg-surface p-5 shadow-card transition hover:border-border-strong hover:shadow-modal"
                  href={`/appointments/${appointment.id}`}
                  key={appointment.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand">
                      <CalendarIcon className="size-5" />
                    </span>
                    <Badge tone={appointment.statusTone}>{appointment.statusLabel}</Badge>
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-ink group-hover:text-brand">
                    {appointment.title}
                  </h3>
                  <p className="mt-0.5 text-sm text-muted">
                    {appointment.businessName} · {appointment.staffName}
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-sm text-muted">
                    <ClockIcon className="size-4" />
                    {appointment.dateTimeLabel} · {appointment.duration}
                  </div>
                  <p className="mt-4 border-t border-border pt-3 text-xs text-subtle">
                    Reference {appointment.reference}
                  </p>
                </Link>
              ))}
            </div>

            {appointmentsQuery.hasNextPage || appointmentsQuery.isError ? (
              <div className="mt-6 flex justify-center">
                <Button
                  isLoading={appointmentsQuery.isFetchingNextPage}
                  leadingIcon={<RefreshIcon className="size-4" />}
                  onClick={() =>
                    appointmentsQuery.isError
                      ? void appointmentsQuery.refetch()
                      : void appointmentsQuery.fetchNextPage()
                  }
                  variant="secondary"
                >
                  {appointmentsQuery.isFetchingNextPage
                    ? "Loading…"
                    : appointmentsQuery.isError
                      ? "Retry"
                      : "Load more"}
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
            <CalendarIcon className="mx-auto size-8 text-subtle" />
            <h3 className="mt-4 text-sm font-semibold text-ink">No appointments here</h3>
            <p className="mt-1 text-sm text-muted">
              Appointments matching this status will appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function AppointmentListSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2" role="status">
      <span className="sr-only">Loading appointments</span>
      {[0, 1, 2, 3].map((item) => (
        <div className="rounded-xl border border-border bg-surface p-5" key={item}>
          <div className="flex justify-between gap-3">
            <Skeleton className="size-10 rounded-[10px]" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="mt-5 h-5 w-3/5" />
          <Skeleton className="mt-3 h-4 w-4/5" />
          <Skeleton className="mt-5 h-3 w-2/5" />
        </div>
      ))}
    </div>
  );
}

function AppointmentListError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6 text-center shadow-card">
      <Alert className="text-left" tone="danger">{message}</Alert>
      <Button
        className="mt-4"
        leadingIcon={<RefreshIcon className="size-4" />}
        onClick={onRetry}
        variant="secondary"
      >
        Try again
      </Button>
    </div>
  );
}
