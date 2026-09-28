"use client";

import { useState } from "react";

import { Button, LinkButton } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { TextAreaField } from "@/components/ui/form-controls";
import { CheckCircleIcon } from "@/components/ui/icons";
import { useAuth } from "@/features/auth/auth-context";
import { SlotPicker } from "@/features/availability/components/slot-picker";
import { usePublicDaySlots } from "@/features/availability/hooks/use-day-slots";
import { GuestSignIn } from "@/features/public-booking/components/guest-sign-in";
import { useConfirmAppointment, useCreateHold } from "@/generated/api/appointments/appointments";
import type { AppointmentResponse, AvailableSlot, PublicServiceResponse } from "@/generated/api/models";
import { useListPublicServices, useListPublicStaff } from "@/generated/api/public-booking/public-booking";
import { useBrowserTimeZone } from "@/hooks/use-browser-time-zone";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { cn } from "@/lib/utils/cn";
import { formatDateTime, getCurrentLocalDate } from "@/lib/utils/date-time";
import { formatMoney } from "@/lib/utils/money";

type Step = "service" | "provider" | "time" | "details";

const STEPS: ReadonlyArray<{ id: Step; label: string }> = [
  { id: "service", label: "Service" },
  { id: "provider", label: "Provider" },
  { id: "time", label: "Time" },
  { id: "details", label: "You" },
];

interface BookingStepsProps {
  slug: string;
  allowGuestBooking: boolean;
  /** Inside the widget: links and payment pages open in a new tab. */
  embedded?: boolean;
}

/** Books step by step: service, provider, time, then who is coming. */
export function BookingSteps({ allowGuestBooking, embedded = false, slug }: BookingStepsProps) {
  const { status, user } = useAuth();
  const timeZone = useBrowserTimeZone();
  const [step, setStep] = useState<Step>("service");
  const [service, setService] = useState<PublicServiceResponse | null>(null);
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(() => getCurrentLocalDate(timeZone));
  const [slot, setSlot] = useState<AvailableSlot | null>(null);
  const [notes, setNotes] = useState("");
  const [booked, setBooked] = useState<AppointmentResponse | null>(null);
  const servicesQuery = useListPublicServices(slug);
  const staffQuery = useListPublicStaff(slug, { serviceId: service?.id ?? "" }, { query: { enabled: Boolean(service) } });
  const daySlots = usePublicDaySlots(slug, {
    date,
    serviceId: service?.id ?? "",
    timeZone,
    ...(staffId ? { staffId } : {}),
  });
  const holdMutation = useCreateHold();
  const confirmMutation = useConfirmAppointment();
  const error = holdMutation.error ?? confirmMutation.error;
  const isBooking = holdMutation.isPending || confirmMutation.isPending;
  const staff = staffQuery.data?.items ?? [];
  const newTab = embedded ? { target: "_blank", rel: "noopener" } : {};

  function book() {
    if (!service || !slot || isBooking) return;

    holdMutation.mutate(
      {
        data: {
          businessSlug: slug,
          serviceId: service.id,
          startsAt: String(slot.startsAt),
          ...(staffId ? { staffId } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      },
      {
        onSuccess: (hold) =>
          confirmMutation.mutate(
            { appointmentId: hold.id },
            {
              onSuccess: (appointment) => {
                const checkoutUrl = appointment.payment?.checkoutUrl;

                // A deposit is paid on Stripe's page; the widget's frame can't show it.
                if (checkoutUrl) {
                  if (embedded) window.open(checkoutUrl, "_blank", "noopener");
                  else window.location.assign(checkoutUrl);
                }

                setBooked(appointment);
              },
            },
          ),
      },
    );
  }

  function restart() {
    holdMutation.reset();
    confirmMutation.reset();
    setBooked(null);
    setSlot(null);
    setNotes("");
    setStep("service");
  }

  if (booked) {
    const isRequest = booked.status === "PENDING";
    const needsPayment = booked.status === "PENDING_PAYMENT";

    return (
      <div className="space-y-4 text-center">
        <CheckCircleIcon className="mx-auto size-10 text-success" />
        <div>
          <h3 className="text-lg font-bold text-ink">
            {needsPayment ? "Almost done" : isRequest ? "Request sent" : "You're booked"}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {booked.serviceName} · {formatDateTime(booked.scheduledAt, booked.timeZone)}
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            {needsPayment
              ? "Pay the deposit on the page that opened to confirm your booking."
              : isRequest
                ? "The business will confirm it and email you."
                : "We've emailed you the details and a calendar invite."}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <LinkButton href={`/appointments/${booked.id}`} size="sm" variant="secondary" {...newTab}>
            View or change it
          </LinkButton>
          <Button onClick={restart} size="sm" variant="ghost">
            Book something else
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ol className="flex gap-1" aria-label="Booking steps">
        {STEPS.map((item, index) => {
          const current = STEPS.findIndex((entry) => entry.id === step);

          return (
            <li
              aria-current={item.id === step ? "step" : undefined}
              className={cn(
                "flex-1 border-t-2 pt-1.5 text-[11px] font-semibold",
                index <= current ? "border-brand text-brand" : "border-border text-subtle",
              )}
              key={item.id}
            >
              {item.label}
            </li>
          );
        })}
      </ol>

      {step === "service" ? (
        servicesQuery.isPending ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : servicesQuery.isError ? (
          <Alert tone="danger">{getApiErrorMessage(servicesQuery.error, "Services could not be loaded.")}</Alert>
        ) : (
          <ul className="space-y-2">
            {(servicesQuery.data?.items ?? []).map((item) => (
              <li key={item.id}>
                <button
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-left transition-colors hover:border-brand hover:bg-brand-soft/40"
                  onClick={() => {
                    setService(item);
                    setStaffId("");
                    setSlot(null);
                    setStep("provider");
                  }}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{item.name}</span>
                    <span className="block text-xs text-muted">{item.durationMinutes} min</span>
                  </span>
                  <span className="text-sm font-semibold text-ink">
                    {item.priceMinor > 0 ? formatMoney(item.priceMinor, item.currency) : "Free"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {step === "provider" && service ? (
        <div className="space-y-2">
          <StepHeading onBack={() => setStep("service")} title={`Who would you like for ${service.name}?`} />
          {staffQuery.isPending ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : (
            [{ id: "", displayName: "Anyone available" }, ...staff].map((member) => (
              <button
                className="block w-full rounded-xl border border-border px-4 py-3 text-left text-sm font-semibold text-ink transition-colors hover:border-brand hover:bg-brand-soft/40"
                key={member.id || "anyone"}
                onClick={() => {
                  setStaffId(member.id);
                  setSlot(null);
                  setStep("time");
                }}
                type="button"
              >
                {member.displayName}
              </button>
            ))
          )}
        </div>
      ) : null}

      {step === "time" && service ? (
        <div className="space-y-3">
          <StepHeading onBack={() => setStep("provider")} title="Pick a time" />
          <SlotPicker
            date={date}
            error={daySlots.error}
            idPrefix="public-booking"
            isLoading={daySlots.isLoading}
            minDate={getCurrentLocalDate(timeZone)}
            onDateChange={(value) => {
              setDate(value);
              setSlot(null);
            }}
            onSelect={setSlot}
            selectedStartsAt={slot ? String(slot.startsAt) : null}
            slots={daySlots.slots}
            timeZone={timeZone}
          />
          <Button disabled={!slot} fullWidth onClick={() => setStep("details")}>
            Continue
          </Button>
        </div>
      ) : null}

      {step === "details" && service && slot ? (
        <div className="space-y-4">
          <StepHeading onBack={() => setStep("time")} title="Your details" />
          <p className="rounded-xl bg-surface-subtle px-4 py-3 text-sm text-ink-soft">
            <strong className="text-ink">{service.name}</strong> · {formatDateTime(String(slot.startsAt), timeZone)}
            {service.depositMinor ? (
              <span className="block text-xs text-muted">
                A deposit of {formatMoney(service.depositMinor, service.currency)} is taken when you confirm.
              </span>
            ) : null}
          </p>
          {status === "authenticated" && user ? (
            <>
              <p className="text-sm text-muted">
                Booking as <span className="font-semibold text-ink">{user.fullName}</span> ({user.email})
              </p>
              <TextAreaField
                id="public-booking-notes"
                label="Anything we should know? (optional)"
                maxLength={2_000}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                value={notes}
              />
              {error ? (
                <Alert tone="danger">
                  {getApiErrorMessage(error, "That time couldn't be booked. It may have just been taken; pick another.")}
                </Alert>
              ) : null}
              <Button fullWidth isLoading={isBooking} onClick={book}>
                Confirm booking
              </Button>
            </>
          ) : status === "loading" ? (
            <Skeleton className="h-32 rounded-xl" />
          ) : (
            <GuestSignIn allowGuestBooking={allowGuestBooking} embedded={embedded} purpose="to book" slug={slug} />
          )}
        </div>
      ) : null}
    </div>
  );
}

function StepHeading({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <Button onClick={onBack} size="sm" variant="ghost">
        Back
      </Button>
    </div>
  );
}
