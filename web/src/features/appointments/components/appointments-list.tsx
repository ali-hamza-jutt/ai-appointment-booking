"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { CalendarIcon, ClockIcon, PlusIcon } from "@/components/ui/icons";
import { appointmentPreviews } from "@/features/appointments/data/appointment-preview-data";
import type { AppointmentStatusView } from "@/features/appointments/types/appointment-ui";
import { cn } from "@/lib/utils/cn";

const tabs: Array<{ label: string; value: AppointmentStatusView }> = [
  { label: "Upcoming", value: "upcoming" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

export function AppointmentsList() {
  const [activeStatus, setActiveStatus] = useState<AppointmentStatusView>("upcoming");
  const visibleAppointments = appointmentPreviews.filter(
    (appointment) => appointment.status === activeStatus,
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-ink">Your appointments</h2>
          <p className="mt-1 text-sm text-muted">View booking details and manage upcoming plans.</p>
        </div>
        <LinkButton href="/book" leadingIcon={<PlusIcon className="size-4" />}>
          Book an appointment
        </LinkButton>
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-selected={activeStatus === tab.value}
            className={cn(
              "relative min-h-11 shrink-0 px-4 text-sm font-semibold transition-colors",
              activeStatus === tab.value ? "text-brand" : "text-muted hover:text-ink",
            )}
            key={tab.value}
            onClick={() => setActiveStatus(tab.value)}
            role="tab"
            type="button"
          >
            {tab.label}
            {activeStatus === tab.value ? (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand" />
            ) : null}
          </button>
        ))}
      </div>

      {visibleAppointments.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {visibleAppointments.map((appointment) => (
            <Link
              className="group rounded-xl border border-border bg-surface p-5 shadow-card transition hover:border-border-strong hover:shadow-modal"
              href={`/appointments/${appointment.id}`}
              key={appointment.id}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand">
                  <CalendarIcon className="size-5" />
                </span>
                <Badge tone={appointment.statusTone}>{appointment.status}</Badge>
              </div>
              <h3 className="mt-4 text-base font-semibold text-ink group-hover:text-brand">
                {appointment.title}
              </h3>
              <div className="mt-3 flex items-center gap-2 text-sm text-muted">
                <ClockIcon className="size-4" />
                {appointment.dateTimeLabel} · {appointment.duration}
              </div>
              <p className="mt-4 border-t border-border pt-3 text-xs text-subtle">
                Reference {appointment.bookingReference}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
          <CalendarIcon className="mx-auto size-8 text-subtle" />
          <h3 className="mt-4 text-sm font-semibold text-ink">No appointments here</h3>
          <p className="mt-1 text-sm text-muted">Appointments with this status will appear here.</p>
        </div>
      )}
    </div>
  );
}
