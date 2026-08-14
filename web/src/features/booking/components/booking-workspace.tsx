"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  EditIcon,
  GlobeIcon,
  SendIcon,
  SparklesIcon,
} from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-context";
import type {
  BookingDraftViewModel,
  ChatMessageViewModel,
} from "@/features/booking/types/booking-ui";

const suggestions = [
  "Book a consultation next Tuesday at 10 AM",
  "Schedule a 30-minute follow-up this Friday",
  "I need a planning session next week",
];

const previewDraft: BookingDraftViewModel = {
  date: "Tuesday, August 18, 2026",
  duration: "30 minutes",
  notes: "Discuss project goals and next steps.",
  time: "10:00 AM",
  timezone: "Asia/Karachi",
  title: "Project consultation",
};

export function BookingWorkspace() {
  const { user } = useAuth();
  const firstName = user?.fullName.trim().split(/\s+/)[0] ?? "there";
  const [messages, setMessages] = useState<ChatMessageViewModel[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      text: `Hi ${firstName}! Tell me what you would like to schedule, and I’ll help turn it into an appointment.`,
    },
  ]);
  const [composer, setComposer] = useState("");
  const [draft, setDraft] = useState<BookingDraftViewModel | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const responseTimerRef = useRef<number | undefined>(undefined);
  const confirmationTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      window.clearTimeout(responseTimerRef.current);
      window.clearTimeout(confirmationTimerRef.current);
    };
  }, []);

  function sendMessage(text: string) {
    const trimmedMessage = text.trim();
    if (!trimmedMessage || isSending) return;

    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: trimmedMessage },
    ]);
    setComposer("");
    setIsSending(true);

    responseTimerRef.current = window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "I found the details below. Review them before you confirm the booking.",
        },
      ]);
      setDraft(previewDraft);
      setIsSending(false);
    }, 700);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage(composer);
  }

  function confirmBooking() {
    if (isConfirming) return;
    setIsConfirming(true);

    confirmationTimerRef.current = window.setTimeout(() => {
      setIsConfirming(false);
      setIsConfirmOpen(false);
      setIsConfirmed(true);
    }, 700);
  }

  return (
    <div className="grid min-h-[calc(100dvh-4rem)] xl:grid-cols-[minmax(0,1fr)_372px]">
      <section className="flex min-h-[600px] flex-col bg-surface">
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-[10px] bg-brand-soft text-brand">
              <SparklesIcon className="size-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-ink">AI booking assistant</h2>
              <p className="text-xs text-muted">Describe your appointment in everyday language.</p>
            </div>
          </div>
        </div>

        <div className="bw-scrollbar flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.map((message) => (
              <div
                className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
                key={message.id}
              >
                <div
                  className={
                    message.role === "user"
                      ? "max-w-[82%] rounded-2xl rounded-br-[5px] bg-brand px-4 py-3 text-sm leading-6 text-surface"
                      : "max-w-[82%] rounded-2xl rounded-bl-[5px] border border-border bg-surface-subtle px-4 py-3 text-sm leading-6 text-ink-soft"
                  }
                >
                  {message.text}
                </div>
              </div>
            ))}

            {isSending ? (
              <div className="flex justify-start" role="status">
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-[5px] border border-border bg-surface-subtle px-4 py-3 text-muted">
                  <span className="size-1.5 animate-bw-pulse rounded-full bg-current" />
                  <span className="size-1.5 animate-bw-pulse rounded-full bg-current [animation-delay:120ms]" />
                  <span className="size-1.5 animate-bw-pulse rounded-full bg-current [animation-delay:240ms]" />
                  <span className="sr-only">Assistant is preparing a response</span>
                </div>
              </div>
            ) : null}

            {messages.length === 1 ? (
              <div className="pt-1">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">
                  Try an example
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((suggestion) => (
                    <button
                      className="rounded-full border border-border bg-surface px-3 py-2 text-left text-xs text-ink-soft transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isSending}
                      key={suggestion}
                      onClick={() => sendMessage(suggestion)}
                      type="button"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-border bg-surface px-4 py-4 sm:px-6">
          <form className="mx-auto max-w-3xl" onSubmit={handleSubmit}>
            <div className="flex items-end gap-2 rounded-xl border border-border bg-surface p-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-focus">
              <textarea
                aria-label="Describe your appointment"
                className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-ink outline-none placeholder:text-subtle disabled:cursor-not-allowed"
                disabled={isSending}
                onChange={(event) => setComposer(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage(composer);
                  }
                }}
                placeholder="Example: Book a 30-minute consultation next Tuesday at 10 AM"
                rows={1}
                value={composer}
              />
              <Button
                aria-label="Send message"
                className="size-10 shrink-0 px-0"
                disabled={!composer.trim()}
                isLoading={isSending}
                type="submit"
              >
                {isSending ? <span className="sr-only">Sending</span> : <SendIcon className="size-4" />}
              </Button>
            </div>
            <p className="mt-2 text-center text-[11px] text-subtle">
              AI can make mistakes. Review appointment details before confirming.
            </p>
          </form>
        </div>
      </section>

      <aside className="border-t border-border bg-canvas px-5 py-6 xl:border-l xl:border-t-0">
        <div className="mx-auto max-w-xl xl:sticky xl:top-20">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">Booking details</h2>
              <p className="mt-0.5 text-xs text-muted">Review before you confirm.</p>
            </div>
            {draft ? <Badge tone="warning">Draft</Badge> : null}
          </div>

          {isConfirmed ? (
            <Alert className="mb-4" tone="success">
              Your appointment has been booked successfully.
            </Alert>
          ) : null}

          {draft ? (
            <div className="rounded-xl border border-border bg-surface shadow-card">
              <div className="space-y-5 p-5">
                <DraftRow icon={<CalendarIcon className="size-[18px]" />} label="Appointment" value={draft.title} />
                <DraftRow icon={<CalendarIcon className="size-[18px]" />} label="Date" value={draft.date} />
                <DraftRow icon={<ClockIcon className="size-[18px]" />} label="Time" value={`${draft.time} · ${draft.duration}`} />
                <DraftRow icon={<GlobeIcon className="size-[18px]" />} label="Timezone" value={draft.timezone} />
                <div className="border-t border-border pt-4">
                  <p className="text-xs font-semibold text-muted">Notes</p>
                  <p className="mt-1 text-sm leading-6 text-ink-soft">{draft.notes}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 border-t border-border p-4 sm:flex-row xl:flex-col">
                <Button
                  fullWidth
                  leadingIcon={<CheckCircleIcon className="size-4" />}
                  onClick={() => setIsConfirmOpen(true)}
                >
                  Confirm booking
                </Button>
                <Button fullWidth leadingIcon={<EditIcon className="size-4" />} variant="secondary">
                  Edit details
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
              <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-surface-subtle text-muted">
                <CalendarIcon className="size-5" />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-ink">No booking draft yet</h3>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-muted">
                Send a message and the assistant will organize the date, time, and other details here.
              </p>
            </div>
          )}
        </div>
      </aside>

      <Modal
        description="Check the final details. You can still go back and edit them."
        isOpen={isConfirmOpen}
        onClose={() => !isConfirming && setIsConfirmOpen(false)}
        title="Confirm appointment"
      >
        <div className="space-y-4 p-5 sm:p-6">
          <div className="rounded-[10px] bg-surface-subtle p-4 text-sm text-ink-soft">
            <p className="font-semibold text-ink">{draft?.title}</p>
            <p className="mt-1">{draft?.date} at {draft?.time}</p>
            <p className="mt-1 text-xs text-muted">{draft?.timezone}</p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button disabled={isConfirming} onClick={() => setIsConfirmOpen(false)} variant="secondary">
              Go back
            </Button>
            <Button isLoading={isConfirming} onClick={confirmBooking}>
              {isConfirming ? "Booking…" : "Confirm appointment"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function DraftRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-brand">{icon}</span>
      <div>
        <p className="text-xs font-semibold text-muted">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-ink">{value}</p>
      </div>
    </div>
  );
}
