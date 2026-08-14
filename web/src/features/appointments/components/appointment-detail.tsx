"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import {
  ArrowLeftIcon,
  CalendarIcon,
  ClockIcon,
  EditIcon,
  GlobeIcon,
  TrashIcon,
} from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import type { AppointmentViewModel } from "@/features/appointments/types/appointment-ui";

export function AppointmentDetail({ appointment }: { appointment: AppointmentViewModel }) {
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  function cancelAppointment() {
    if (isCancelling) return;
    setIsCancelling(true);
    timerRef.current = window.setTimeout(() => {
      setIsCancelling(false);
      setIsCancelOpen(false);
      setIsCancelled(true);
    }, 700);
  }

  const displayedStatus = isCancelled ? "cancelled" : appointment.status;
  const displayedTone = isCancelled ? "danger" : appointment.statusTone;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <Link className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink" href="/appointments">
        <ArrowLeftIcon className="size-4" />
        Back to appointments
      </Link>

      {isCancelled ? (
        <Alert className="mb-4" tone="success">The appointment was cancelled.</Alert>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-[10px] bg-brand-soft text-brand">
                <CalendarIcon className="size-5" />
              </span>
              <Badge tone={displayedTone}>{displayedStatus}</Badge>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-ink">{appointment.title}</h2>
            <p className="mt-1 text-xs text-subtle">Reference {appointment.bookingReference}</p>
          </div>
        </header>

        <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
          <DetailItem icon={<CalendarIcon className="size-[18px]" />} label="Date" value={appointment.date} />
          <DetailItem icon={<ClockIcon className="size-[18px]" />} label="Time" value={`${appointment.time} · ${appointment.duration}`} />
          <DetailItem icon={<GlobeIcon className="size-[18px]" />} label="Timezone" value={appointment.timezone} />
          <DetailItem icon={<CalendarIcon className="size-[18px]" />} label="Created with" value="BookWise AI assistant" />
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold text-muted">Notes</p>
            <p className="mt-1.5 text-sm leading-6 text-ink-soft">{appointment.notes}</p>
          </div>
        </div>

        {displayedStatus === "upcoming" ? (
          <footer className="flex flex-col gap-2 border-t border-border bg-surface-subtle p-4 sm:flex-row sm:justify-end">
            <Button leadingIcon={<EditIcon className="size-4" />} variant="secondary">Edit appointment</Button>
            <Button leadingIcon={<TrashIcon className="size-4" />} onClick={() => setIsCancelOpen(true)} variant="danger">
              Cancel appointment
            </Button>
          </footer>
        ) : null}
      </section>

      <Modal
        description="This action will mark the appointment as cancelled."
        isOpen={isCancelOpen}
        onClose={() => !isCancelling && setIsCancelOpen(false)}
        title="Cancel appointment?"
      >
        <div className="flex flex-col-reverse gap-2 p-5 sm:flex-row sm:justify-end sm:p-6">
          <Button disabled={isCancelling} onClick={() => setIsCancelOpen(false)} variant="secondary">Keep appointment</Button>
          <Button isLoading={isCancelling} onClick={cancelAppointment} variant="danger">
            {isCancelling ? "Cancelling…" : "Cancel appointment"}
          </Button>
        </div>
      </Modal>
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
