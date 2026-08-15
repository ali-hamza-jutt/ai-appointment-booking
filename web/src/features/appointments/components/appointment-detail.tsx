"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/feedback";
import {
  ArrowLeftIcon,
  CalendarIcon,
  ClockIcon,
  GlobeIcon,
  RefreshIcon,
} from "@/components/ui/icons";
import { toAppointmentViewModel } from "@/features/appointments/utils/appointment-format";
import { useBrowserTimeZone } from "@/hooks/use-browser-time-zone";
import { useGetAppointment } from "@/generated/api/appointments/appointments";
import { getApiErrorMessage, isApiError } from "@/lib/api/api-error";

export function AppointmentDetail({ appointmentId }: { appointmentId: string }) {
  const timeZone = useBrowserTimeZone();
  const appointmentQuery = useGetAppointment(appointmentId, {
    query: { retry: false },
  });

  if (appointmentQuery.isPending) {
    return <AppointmentDetailSkeleton />;
  }

  if (appointmentQuery.isError || !appointmentQuery.data) {
    const wasNotFound =
      isApiError(appointmentQuery.error) && appointmentQuery.error.status === 404;
    const hadInvalidId =
      isApiError(appointmentQuery.error) && appointmentQuery.error.status === 422;
    const cannotRetry = wasNotFound || hadInvalidId;

    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <BackToAppointmentsLink />
        <section className="rounded-xl border border-border bg-surface p-6 text-center shadow-card">
          <CalendarIcon className="mx-auto size-9 text-subtle" />
          <h2 className="mt-4 text-lg font-bold text-ink">
            {wasNotFound
              ? "Appointment not found"
              : hadInvalidId
                ? "Invalid appointment link"
                : "Appointment could not be loaded"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            {wasNotFound
              ? "This appointment does not exist or does not belong to your account."
              : hadInvalidId
                ? "The appointment identifier in this link is not valid."
              : getApiErrorMessage(
                  appointmentQuery.error,
                  "This appointment could not be loaded. Please try again.",
                )}
          </p>
          {!cannotRetry ? (
            <Button
              className="mt-5"
              leadingIcon={<RefreshIcon className="size-4" />}
              onClick={() => void appointmentQuery.refetch()}
              variant="secondary"
            >
              Try again
            </Button>
          ) : null}
        </section>
      </div>
    );
  }

  const appointment = toAppointmentViewModel(appointmentQuery.data, timeZone);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <BackToAppointmentsLink />

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-[10px] bg-brand-soft text-brand">
                <CalendarIcon className="size-5" />
              </span>
              <Badge tone={appointment.statusTone}>{appointment.statusLabel}</Badge>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-ink">{appointment.title}</h2>
            <p className="mt-1 break-all text-xs text-subtle">
              Appointment ID {appointment.id}
            </p>
          </div>
        </header>

        <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
          <DetailItem icon={<CalendarIcon className="size-[18px]" />} label="Date" value={appointment.date} />
          <DetailItem icon={<ClockIcon className="size-[18px]" />} label="Time" value={`${appointment.time} · ${appointment.duration}`} />
          <DetailItem icon={<GlobeIcon className="size-[18px]" />} label="Timezone" value={appointment.timezone} />
          <DetailItem icon={<CalendarIcon className="size-[18px]" />} label="Created with" value={appointment.sourceLabel} />
          <DetailItem icon={<ClockIcon className="size-[18px]" />} label="Created" value={appointment.createdAtLabel} />
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold text-muted">Notes</p>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-ink-soft">
              {appointment.notes}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function BackToAppointmentsLink() {
  return (
    <Link
      className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink"
      href="/appointments"
    >
      <ArrowLeftIcon className="size-4" />
      Back to appointments
    </Link>
  );
}

function AppointmentDetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8" role="status">
      <span className="sr-only">Loading appointment details</span>
      <Skeleton className="mb-5 h-5 w-40" />
      <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <Skeleton className="size-11 rounded-[10px]" />
        <Skeleton className="mt-4 h-7 w-1/2" />
        <Skeleton className="mt-2 h-3 w-3/4" />
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-4 w-40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DetailItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-brand">{icon}</span>
      <div>
        <p className="text-xs font-semibold text-muted">{label}</p>
        <p className="mt-1 text-sm font-medium text-ink">{value}</p>
      </div>
    </div>
  );
}
