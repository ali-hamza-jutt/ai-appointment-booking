"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  EditIcon,
  GlobeIcon,
  PlusIcon,
  RefreshIcon,
  SendIcon,
  SparklesIcon,
} from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-context";
import type {
  BookingDraftViewModel,
  ChatMessageDeliveryStatus,
  ChatMessageViewModel,
  PendingChatTurn,
} from "@/features/booking/types/booking-ui";
import {
  getBrowserTimeZone,
  toBookingDraft,
  toConfirmedBookingDraft,
} from "@/features/booking/utils/booking-format";
import { getListAppointmentsQueryKey } from "@/generated/api/appointments/appointments";
import {
  getListSessionsQueryKey,
  useConfirmBooking,
  useCreateMessage,
  useCreateSession,
} from "@/generated/api/chat/chat";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { cn } from "@/lib/utils/cn";

const suggestions = [
  "Book a consultation next Tuesday at 10 AM",
  "Schedule a 30-minute follow-up this Friday",
  "I need a planning session next week",
];

function createWelcomeMessage(firstName: string): ChatMessageViewModel {
  return {
    id: "welcome",
    role: "assistant",
    text: `Hi ${firstName}! Tell me what you would like to schedule, and I’ll help turn it into an appointment.`,
  };
}

export function BookingWorkspace() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const firstName = user?.fullName.trim().split(/\s+/)[0] ?? "there";
  const createSessionMutation = useCreateSession();
  const createMessageMutation = useCreateMessage();
  const confirmBookingMutation = useConfirmBooking();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageViewModel[]>(() => [
    createWelcomeMessage(firstName),
  ]);
  const [composer, setComposer] = useState("");
  const [draft, setDraft] = useState<BookingDraftViewModel | null>(null);
  const [timeZone, setTimeZone] = useState("UTC");
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [isReadyToConfirm, setIsReadyToConfirm] = useState(false);
  const [isProcessingTurn, setIsProcessingTurn] = useState(false);
  const [pendingTurn, setPendingTurn] = useState<PendingChatTurn | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const messageRequestLockRef = useRef(false);
  const confirmationRequestLockRef = useRef(false);

  const isSending = isProcessingTurn;
  const isConfirming = confirmBookingMutation.isPending;
  const hasFailedTurn = Boolean(pendingTurn) && !isSending;
  const isComposerDisabled = isSending || hasFailedTurn || isConfirmed;
  const canConfirm =
    Boolean(sessionId) &&
    Boolean(draft) &&
    isReadyToConfirm &&
    !isSending &&
    !isConfirmed;

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [isSending, messages]);

  function updateOptimisticMessage(
    turn: PendingChatTurn,
    deliveryStatus: ChatMessageDeliveryStatus,
  ) {
    setMessages((current) => {
      const existingMessage = current.find(
        (message) => message.clientMessageId === turn.clientMessageId,
      );

      if (existingMessage) {
        return current.map((message) =>
          message.clientMessageId === turn.clientMessageId
            ? { ...message, deliveryStatus }
            : message,
        );
      }

      return [
        ...current,
        {
          clientMessageId: turn.clientMessageId,
          deliveryStatus,
          id: `pending-${turn.clientMessageId}`,
          role: "user",
          text: turn.text,
        },
      ];
    });
  }

  async function processTurn(turn: PendingChatTurn) {
    if (messageRequestLockRef.current || isConfirmed) return;

    messageRequestLockRef.current = true;
    setIsProcessingTurn(true);
    setPendingTurn(turn);
    setRequestError(null);
    setIsReadyToConfirm(false);
    updateOptimisticMessage(turn, "sending");

    try {
      let activeSessionId = sessionId;

      if (!activeSessionId) {
        const session = await createSessionMutation.mutateAsync({
          data: { title: turn.text.slice(0, 120) },
        });
        activeSessionId = session.id;
        setSessionId(session.id);
      }

      const browserTimeZone = getBrowserTimeZone();
      setTimeZone(browserTimeZone);

      const response = await createMessageMutation.mutateAsync({
        data: {
          clientMessageId: turn.clientMessageId,
          content: turn.text,
          timeZone: browserTimeZone,
        },
        sessionId: activeSessionId,
      });

      setMessages((current) => {
        const deliveredMessages = current.map((message) =>
          message.clientMessageId === turn.clientMessageId
            ? {
                ...message,
                deliveryStatus: "sent" as const,
                text: response.userMessage.content,
              }
            : message,
        );

        if (
          deliveredMessages.some(
            (message) => message.id === response.assistantMessage.id,
          )
        ) {
          return deliveredMessages;
        }

        return [
          ...deliveredMessages,
          {
            id: response.assistantMessage.id,
            role: "assistant" as const,
            text: response.assistantMessage.content,
          },
        ];
      });
      setDraft(toBookingDraft(response.session.bookingContext, browserTimeZone));
      setMissingFields(
        response.assistantMessage.structuredData?.missingFields ?? [],
      );
      setIsReadyToConfirm(
        response.assistantMessage.structuredData?.confirmationRequired === true,
      );
      setPendingTurn(null);
      void queryClient.invalidateQueries({
        queryKey: getListSessionsQueryKey(),
      });
    } catch (error) {
      updateOptimisticMessage(turn, "failed");
      setRequestError(
        getApiErrorMessage(
          error,
          "The assistant could not process your message. Check your connection and try again.",
        ),
      );
    } finally {
      messageRequestLockRef.current = false;
      setIsProcessingTurn(false);
    }
  }

  function sendMessage(text: string) {
    const trimmedMessage = text.trim();
    if (!trimmedMessage || isComposerDisabled || messageRequestLockRef.current) {
      return;
    }

    const turn: PendingChatTurn = {
      clientMessageId: crypto.randomUUID(),
      text: trimmedMessage,
    };
    setComposer("");
    void processTurn(turn);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage(composer);
  }

  function retryPendingTurn() {
    if (pendingTurn && !isSending) void processTurn(pendingTurn);
  }

  function focusComposerForChanges() {
    setComposer("I want to change ");
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  function confirmBooking() {
    if (
      !sessionId ||
      !canConfirm ||
      isConfirming ||
      confirmationRequestLockRef.current
    ) {
      return;
    }

    confirmationRequestLockRef.current = true;
    setConfirmationError(null);
    confirmBookingMutation.mutate(
      { sessionId },
      {
        onError: (error) => {
          setConfirmationError(
            getApiErrorMessage(
              error,
              "The appointment could not be confirmed. Please try again.",
            ),
          );
        },
        onSettled: () => {
          confirmationRequestLockRef.current = false;
        },
        onSuccess: (response) => {
          setMessages((current) =>
            current.some((message) => message.id === response.assistantMessage.id)
              ? current
              : [
                  ...current,
                  {
                    id: response.assistantMessage.id,
                    role: "assistant",
                    text: response.assistantMessage.content,
                  },
                ],
          );
          setDraft(toConfirmedBookingDraft(response.appointment, timeZone));
          setIsReadyToConfirm(false);
          setIsConfirmed(true);
          setIsConfirmOpen(false);
          void Promise.all([
            queryClient.invalidateQueries({
              queryKey: getListAppointmentsQueryKey(),
            }),
            queryClient.invalidateQueries({
              queryKey: getListSessionsQueryKey(),
            }),
          ]);
        },
      },
    );
  }

  function startAnotherBooking() {
    createSessionMutation.reset();
    createMessageMutation.reset();
    confirmBookingMutation.reset();
    setSessionId(null);
    setMessages([createWelcomeMessage(firstName)]);
    setComposer("");
    setDraft(null);
    setMissingFields([]);
    setIsReadyToConfirm(false);
    setIsProcessingTurn(false);
    setPendingTurn(null);
    setRequestError(null);
    setConfirmationError(null);
    setIsConfirmOpen(false);
    setIsConfirmed(false);
    messageRequestLockRef.current = false;
    confirmationRequestLockRef.current = false;
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
            {messages.map((message) => {
              const isUserMessage = message.role === "user";
              const hasFailed = message.deliveryStatus === "failed";

              return (
                <div
                  className={isUserMessage ? "flex justify-end" : "flex justify-start"}
                  key={message.id}
                >
                  <div className="max-w-[82%]">
                    <div
                      className={cn(
                        "px-4 py-3 text-sm leading-6",
                        isUserMessage
                          ? "rounded-2xl rounded-br-[5px] bg-brand text-surface"
                          : "rounded-2xl rounded-bl-[5px] border border-border bg-surface-subtle text-ink-soft",
                        hasFailed &&
                          "border border-danger-border bg-danger-soft text-danger-strong",
                      )}
                    >
                      {message.text}
                    </div>
                    {message.deliveryStatus === "sending" ? (
                      <p className="mt-1 text-right text-[10px] text-subtle">Sending…</p>
                    ) : hasFailed ? (
                      <p className="mt-1 text-right text-[10px] font-medium text-danger">Not processed</p>
                    ) : null}
                  </div>
                </div>
              );
            })}

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

            {requestError ? (
              <Alert tone="danger">
                <p>{requestError}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    leadingIcon={<RefreshIcon className="size-3.5" />}
                    onClick={retryPendingTurn}
                    size="sm"
                    variant="secondary"
                  >
                    Retry message
                  </Button>
                  <Button onClick={startAnotherBooking} size="sm" variant="ghost">
                    Start over
                  </Button>
                </div>
              </Alert>
            ) : null}

            {messages.length === 1 && !isConfirmed ? (
              <div className="pt-1">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">
                  Try an example
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((suggestion) => (
                    <button
                      className="rounded-full border border-border bg-surface px-3 py-2 text-left text-xs text-ink-soft transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isComposerDisabled}
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
            <div ref={messageEndRef} />
          </div>
        </div>

        <div className="border-t border-border bg-surface px-4 py-4 sm:px-6">
          <form className="mx-auto max-w-3xl" onSubmit={handleSubmit}>
            <div className="flex items-end gap-2 rounded-xl border border-border bg-surface p-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-focus">
              <textarea
                aria-label="Describe your appointment"
                className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-ink outline-none placeholder:text-subtle disabled:cursor-not-allowed"
                disabled={isComposerDisabled}
                maxLength={4000}
                onChange={(event) => setComposer(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage(composer);
                  }
                }}
                placeholder={
                  isConfirmed
                    ? "This appointment has been booked"
                    : hasFailedTurn
                      ? "Retry or start over before sending another message"
                      : "Example: Book a 30-minute consultation next Tuesday at 10 AM"
                }
                ref={composerRef}
                rows={1}
                value={composer}
              />
              <Button
                aria-label="Send message"
                className="size-10 shrink-0 px-0"
                disabled={!composer.trim() || isComposerDisabled}
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
            {draft ? (
              <Badge tone={isConfirmed ? "success" : "warning"}>
                {isConfirmed ? "Booked" : "Draft"}
              </Badge>
            ) : null}
          </div>

          {isConfirmed ? (
            <Alert className="mb-4" tone="success">
              Your appointment has been booked successfully.
            </Alert>
          ) : null}

          {draft ? (
            <div className="rounded-xl border border-border bg-surface shadow-card">
              <div className="space-y-5 p-5">
                {missingFields.length > 0 && !isConfirmed ? (
                  <Alert tone="info">
                    Still needed: {missingFields.map(formatMissingField).join(", ")}.
                  </Alert>
                ) : null}
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
                {isConfirmed ? (
                  <Button
                    fullWidth
                    leadingIcon={<PlusIcon className="size-4" />}
                    onClick={startAnotherBooking}
                  >
                    Book another appointment
                  </Button>
                ) : (
                  <>
                    <Button
                      disabled={!canConfirm}
                      fullWidth
                      leadingIcon={<CheckCircleIcon className="size-4" />}
                      onClick={() => setIsConfirmOpen(true)}
                    >
                      {isReadyToConfirm ? "Confirm booking" : "More details needed"}
                    </Button>
                    <Button
                      disabled={isSending || hasFailedTurn}
                      fullWidth
                      leadingIcon={<EditIcon className="size-4" />}
                      onClick={focusComposerForChanges}
                      variant="secondary"
                    >
                      Change details in chat
                    </Button>
                  </>
                )}
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
          {confirmationError ? <Alert tone="danger">{confirmationError}</Alert> : null}
          <div className="rounded-[10px] bg-surface-subtle p-4 text-sm text-ink-soft">
            <p className="font-semibold text-ink">{draft?.title}</p>
            <p className="mt-1">{draft?.date} at {draft?.time}</p>
            <p className="mt-1 text-xs text-muted">{draft?.timezone}</p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              disabled={isConfirming}
              onClick={() => setIsConfirmOpen(false)}
              variant="secondary"
            >
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

function formatMissingField(field: string): string {
  return field.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}
