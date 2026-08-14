"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  useRef,
  useState,
  useEffect,
  useMemo,
  type FormEvent,
  type ReactNode,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
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
import { StructuredBookingForm } from "@/features/booking/components/structured-booking-form";
import { CONVERSATION_UI_CONSTANTS } from "@/features/conversations/constants/conversation-ui.constants";
import { useChatMessagePolling } from "@/features/conversations/hooks/use-chat-message-polling";
import { useConversationMessages } from "@/features/conversations/hooks/use-conversation-messages";
import type {
  BookingDraftViewModel,
  ChatMessageDeliveryStatus,
  ChatMessageViewModel,
  PendingChatTurn,
  StructuredBookingFormValues,
} from "@/features/booking/types/booking-ui";
import {
  getBrowserTimeZone,
  toBookingDraft,
  toConfirmedBookingDraft,
} from "@/features/booking/utils/booking-format";
import { getListAppointmentsQueryKey } from "@/generated/api/appointments/appointments";
import {
  getListMessagesQueryKey,
  getListSessionsQueryKey,
  useGetSession,
  useConfirmBooking,
  useCreateMessage,
  useCreateSession,
} from "@/generated/api/chat/chat";
import type {
  AppointmentBookingContext,
  ChatMessageResponse,
  ChatSessionResponse,
} from "@/generated/api/models";
import { useBrowserTimeZone } from "@/hooks/use-browser-time-zone";
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

interface BookingWorkspaceProps {
  initialSessionId?: string;
}

interface BookingExperienceProps {
  initialMessageCursor?: string;
  initialMessages?: ChatMessageResponse[];
  initialSession?: ChatSessionResponse;
  initialTimeZone: string;
}

export function BookingWorkspace({ initialSessionId }: BookingWorkspaceProps) {
  const isResuming = Boolean(initialSessionId);
  const timeZone = useBrowserTimeZone();
  const sessionQuery = useGetSession(initialSessionId ?? "", {
    query: { enabled: isResuming, retry: false },
  });
  const messagesQuery = useConversationMessages(initialSessionId ?? "", {
    enabled: isResuming,
    limit: CONVERSATION_UI_CONSTANTS.RESUME_MESSAGE_PAGE_SIZE,
  });

  if (!isResuming) {
    return <BookingExperience initialTimeZone={timeZone} />;
  }

  if (sessionQuery.isPending || messagesQuery.isPending) {
    return <BookingResumeSkeleton />;
  }

  if (sessionQuery.isError || messagesQuery.isError || !sessionQuery.data) {
    const error = sessionQuery.error ?? messagesQuery.error;

    return (
      <BookingResumeError
        message={getApiErrorMessage(
          error,
          "This booking conversation could not be resumed. It may no longer be available.",
        )}
        onRetry={() =>
          void Promise.all([sessionQuery.refetch(), messagesQuery.refetch()])
        }
      />
    );
  }

  const initialMessages = Array.from(
    new Map(
      messagesQuery.data.pages
        .flatMap((page) => page.items)
        .map((message) => [message.id, message]),
    ).values(),
  );

  return (
    <BookingExperience
      initialMessageCursor={messagesQuery.data.pages.at(-1)?.nextCursor}
      initialMessages={initialMessages}
      initialSession={sessionQuery.data}
      initialTimeZone={timeZone}
      key={`${sessionQuery.data.id}:${timeZone}`}
    />
  );
}

function BookingExperience({
  initialMessageCursor,
  initialMessages = [],
  initialSession,
  initialTimeZone,
}: BookingExperienceProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const firstName = user?.fullName.trim().split(/\s+/)[0] ?? "there";
  const persistedMessages = initialMessages
    .filter(isBookingMessage)
    .map(toBookingMessageViewModel);
  const initialMissingFields = getMissingBookingFields(
    initialSession?.bookingContext,
  );
  const createSessionMutation = useCreateSession();
  const createMessageMutation = useCreateMessage();
  const confirmBookingMutation = useConfirmBooking();
  const [sessionId, setSessionId] = useState<string | null>(
    initialSession?.id ?? null,
  );
  const [messages, setMessages] = useState<ChatMessageViewModel[]>(() =>
    persistedMessages.length > 0
      ? persistedMessages
      : [createWelcomeMessage(firstName)],
  );
  const [composer, setComposer] = useState("");
  const [draft, setDraft] = useState<BookingDraftViewModel | null>(() =>
    toBookingDraft(initialSession?.bookingContext, initialTimeZone),
  );
  const [bookingContext, setBookingContext] =
    useState<AppointmentBookingContext | null>(
      initialSession?.bookingContext ?? null,
    );
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [missingFields, setMissingFields] = useState<string[]>(
    initialMissingFields,
  );
  const [isReadyToConfirm, setIsReadyToConfirm] = useState(
    initialSession?.status === "ACTIVE" && initialMissingFields.length === 0,
  );
  const [isProcessingTurn, setIsProcessingTurn] = useState(false);
  const [pendingTurn, setPendingTurn] = useState<PendingChatTurn | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isStructuredFormOpen, setIsStructuredFormOpen] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(
    initialSession?.status === "CLOSED",
  );
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const messageRequestLockRef = useRef(false);
  const confirmationRequestLockRef = useRef(false);
  const messagePollingQuery = useChatMessagePolling(sessionId ?? "", {
    enabled: Boolean(sessionId) && !isConfirmed,
    ...(initialMessageCursor ? { initialCursor: initialMessageCursor } : {}),
  });
  const visibleMessages = useMemo(
    () =>
      mergeBookingMessages(messages, messagePollingQuery.data?.items ?? []),
    [messagePollingQuery.data?.items, messages],
  );

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
  }, [isSending, visibleMessages]);

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

  async function processTurn(turn: PendingChatTurn): Promise<boolean> {
    if (messageRequestLockRef.current || isConfirmed) return false;

    messageRequestLockRef.current = true;
    setIsProcessingTurn(true);
    setPendingTurn(turn);
    setRequestError(null);
    setIsReadyToConfirm(false);
    updateOptimisticMessage(turn, "sending");

    try {
      let activeSessionId = sessionId;
      let newlyCreatedSessionId: string | null = null;

      if (!activeSessionId) {
        const session = await createSessionMutation.mutateAsync({
          data: { title: turn.text.slice(0, 120) },
        });
        activeSessionId = session.id;
        newlyCreatedSessionId = session.id;
        setSessionId(session.id);
      }

      const browserTimeZone = getBrowserTimeZone();
      setTimeZone(browserTimeZone);

      const response = await createMessageMutation.mutateAsync({
        data: {
          clientMessageId: turn.clientMessageId,
          content: turn.text,
          timeZone: browserTimeZone,
          ...(turn.bookingDetails
            ? { bookingDetails: turn.bookingDetails }
            : {}),
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
      setBookingContext(response.session.bookingContext);
      setDraft(toBookingDraft(response.session.bookingContext, browserTimeZone));
      setMissingFields(
        response.assistantMessage.structuredData?.missingFields ?? [],
      );
      setIsReadyToConfirm(
        response.assistantMessage.structuredData?.confirmationRequired === true,
      );
      setPendingTurn(null);
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: getListSessionsQueryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: getListMessagesQueryKey(activeSessionId),
        }),
      ]);

      if (newlyCreatedSessionId) {
        router.replace(
          `/book?sessionId=${encodeURIComponent(newlyCreatedSessionId)}`,
          { scroll: false },
        );
      }
      return true;
    } catch (error) {
      updateOptimisticMessage(turn, "failed");
      setRequestError(
        getApiErrorMessage(
          error,
          "The assistant could not process your message. Check your connection and try again.",
        ),
      );
      return false;
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

  async function submitStructuredBookingDetails(
    values: StructuredBookingFormValues,
  ): Promise<boolean> {
    if (isSending || isConfirmed || messageRequestLockRef.current) {
      return false;
    }

    const turn: PendingChatTurn = pendingTurn
      ? { ...pendingTurn, bookingDetails: values }
      : {
        bookingDetails: values,
        clientMessageId: crypto.randomUUID(),
        text: "I completed the structured booking form.",
      };

    return processTurn(turn);
  }

  function openStructuredBookingForm() {
    if (isSending || isConfirmed) return;

    setRequestError(null);
    setIsStructuredFormOpen(true);
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
          setBookingContext({
            serviceName: response.appointment.serviceName,
            scheduledAt: response.appointment.scheduledAt,
            durationMinutes: response.appointment.durationMinutes,
            ...(response.appointment.notes
              ? { notes: response.appointment.notes }
              : {}),
          });
          setIsReadyToConfirm(false);
          setIsConfirmed(true);
          setIsConfirmOpen(false);
          setIsStructuredFormOpen(false);
          void Promise.all([
            queryClient.invalidateQueries({
              queryKey: getListAppointmentsQueryKey(),
            }),
            queryClient.invalidateQueries({
              queryKey: getListSessionsQueryKey(),
            }),
            queryClient.invalidateQueries({
              queryKey: getListMessagesQueryKey(sessionId),
            }),
          ]);
        },
      },
    );
  }

  function startAnotherBooking() {
    router.replace(`/book?new=${crypto.randomUUID()}`);
    createSessionMutation.reset();
    createMessageMutation.reset();
    confirmBookingMutation.reset();
    setSessionId(null);
    setMessages([createWelcomeMessage(firstName)]);
    setComposer("");
    setDraft(null);
    setBookingContext(null);
    setTimeZone(getBrowserTimeZone());
    setMissingFields([]);
    setIsReadyToConfirm(false);
    setIsProcessingTurn(false);
    setPendingTurn(null);
    setRequestError(null);
    setConfirmationError(null);
    setIsConfirmOpen(false);
    setIsStructuredFormOpen(false);
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
            {visibleMessages.map((message) => {
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

            {visibleMessages.length === 1 && !isConfirmed ? (
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
            <div className="flex items-end gap-2 rounded-xl border border-border bg-surface p-2 focus-within:border-brand">
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
                      disabled={isSending}
                      fullWidth
                      leadingIcon={<EditIcon className="size-4" />}
                      onClick={openStructuredBookingForm}
                      variant="secondary"
                    >
                      {missingFields.length > 0
                        ? "Complete details in form"
                        : "Edit details in form"}
                    </Button>
                    <Button
                      disabled={isSending || hasFailedTurn}
                      fullWidth
                      leadingIcon={<EditIcon className="size-4" />}
                      onClick={focusComposerForChanges}
                      variant="ghost"
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
              {visibleMessages.length > 1 ? (
                <Button
                  className="mt-5"
                  disabled={isSending}
                  leadingIcon={<EditIcon className="size-4" />}
                  onClick={openStructuredBookingForm}
                  variant="secondary"
                >
                  Complete details in form
                </Button>
              ) : null}
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

      {isStructuredFormOpen ? (
        <StructuredBookingForm
          bookingContext={bookingContext}
          initialValues={pendingTurn?.bookingDetails}
          isSubmitting={isSending}
          onClose={() => !isSending && setIsStructuredFormOpen(false)}
          onSubmit={submitStructuredBookingDetails}
          submissionError={requestError}
          timeZone={timeZone}
        />
      ) : null}
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

function isBookingMessage(
  message: ChatMessageResponse,
): message is ChatMessageResponse & { role: "ASSISTANT" | "USER" } {
  return message.role === "ASSISTANT" || message.role === "USER";
}

function toBookingMessageViewModel(
  message: ChatMessageResponse & { role: "ASSISTANT" | "USER" },
): ChatMessageViewModel {
  return {
    ...(message.clientMessageId
      ? { clientMessageId: message.clientMessageId }
      : {}),
    ...(message.role === "USER" ? { deliveryStatus: "sent" as const } : {}),
    id: message.id,
    role: message.role === "USER" ? "user" : "assistant",
    text: message.content,
  };
}

function mergeBookingMessages(
  current: ChatMessageViewModel[],
  polledMessages: ChatMessageResponse[],
): ChatMessageViewModel[] {
  if (polledMessages.length === 0) return current;

  const mergedMessages = [...current];

  for (const polledMessage of polledMessages) {
    if (!isBookingMessage(polledMessage)) continue;

    const message = toBookingMessageViewModel(polledMessage);
    const existingIndex = mergedMessages.findIndex(
      (existingMessage) =>
        existingMessage.id === message.id ||
        (message.clientMessageId !== undefined &&
          existingMessage.clientMessageId === message.clientMessageId),
    );

    if (existingIndex >= 0) {
      mergedMessages[existingIndex] = message;
    } else {
      mergedMessages.push(message);
    }
  }

  return mergedMessages;
}

function getMissingBookingFields(
  context: AppointmentBookingContext | null | undefined,
): string[] {
  const missingFields: string[] = [];

  if (!context?.serviceName?.trim()) missingFields.push("serviceName");
  if (!context?.scheduledAt) missingFields.push("scheduledAt");

  return missingFields;
}

function BookingResumeSkeleton() {
  return (
    <div
      className="grid min-h-[calc(100dvh-4rem)] xl:grid-cols-[minmax(0,1fr)_372px]"
      role="status"
    >
      <span className="sr-only">Loading booking conversation</span>
      <section className="bg-surface px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-3 border-b border-border pb-5">
            <Skeleton className="size-10 rounded-[10px]" />
            <div className="flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-64 max-w-full" />
            </div>
          </div>
          <div className="space-y-5 py-8">
            <Skeleton className="h-16 w-3/4 rounded-2xl" />
            <Skeleton className="ml-auto h-14 w-2/3 rounded-2xl" />
            <Skeleton className="h-20 w-4/5 rounded-2xl" />
          </div>
        </div>
      </section>
      <aside className="border-t border-border bg-canvas px-5 py-6 xl:border-l xl:border-t-0">
        <Skeleton className="h-5 w-32" />
        <div className="mt-5 rounded-xl border border-border bg-surface p-5">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="mt-5 h-4 w-4/5" />
          <Skeleton className="mt-5 h-4 w-2/3" />
          <Skeleton className="mt-5 h-4 w-3/4" />
        </div>
      </aside>
    </div>
  );
}

function BookingResumeError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
        <h2 className="text-lg font-semibold text-ink">
          Booking conversation unavailable
        </h2>
        <Alert className="mt-4" tone="danger">
          {message}
        </Alert>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            leadingIcon={<RefreshIcon className="size-4" />}
            onClick={onRetry}
            variant="secondary"
          >
            Try again
          </Button>
          <LinkButton href="/book?new=true">Start a new booking</LinkButton>
        </div>
      </div>
    </div>
  );
}
