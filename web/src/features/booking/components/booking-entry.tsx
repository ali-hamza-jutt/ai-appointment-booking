"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import {
  ChatIcon,
  ConversationsIcon,
  PlusIcon,
  RefreshIcon,
} from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { BookingWorkspace } from "@/features/booking/components/booking-workspace";
import { useListSessions } from "@/generated/api/chat/chat";
import { getApiErrorMessage } from "@/lib/api/api-error";

interface BookingEntryProps {
  initialSessionId?: string;
  newBookingKey?: string;
  shouldStartNew: boolean;
}

type BookingChoice = "new" | "previous";

export function BookingEntry({
  initialSessionId,
  newBookingKey,
  shouldStartNew,
}: BookingEntryProps) {
  const router = useRouter();
  const [selectedChoice, setSelectedChoice] =
    useState<BookingChoice | null>(null);
  const [isNavigating, startTransition] = useTransition();
  const shouldCheckActiveSessions = !initialSessionId && !shouldStartNew;
  const activeSessionsQuery = useListSessions(
    { limit: 2, status: "ACTIVE" },
    {
      query: {
        enabled: shouldCheckActiveSessions,
        retry: false,
      },
    },
  );

  function chooseBooking(choice: BookingChoice, sessionId?: string) {
    if (selectedChoice || (choice === "previous" && !sessionId)) return;

    setSelectedChoice(choice);
    startTransition(() => {
      router.replace(
        choice === "previous"
          ? `/book?sessionId=${encodeURIComponent(sessionId!)}`
          : `/book?new=${crypto.randomUUID()}`,
      );
    });
  }

  if (initialSessionId) {
    return (
      <BookingWorkspace
        initialSessionId={initialSessionId}
        key={initialSessionId}
      />
    );
  }

  if (shouldStartNew) {
    return <BookingWorkspace key={newBookingKey || "new"} />;
  }

  if (activeSessionsQuery.isPending) {
    return <BookingEntrySkeleton />;
  }

  if (activeSessionsQuery.isError) {
    return (
      <BookingEntryError
        isStartingNew={selectedChoice === "new"}
        message={getApiErrorMessage(
          activeSessionsQuery.error,
          "BookWise could not check for active conversations. Check your connection and try again.",
        )}
        onRetry={() => void activeSessionsQuery.refetch()}
        onStartNew={() => chooseBooking("new")}
      />
    );
  }

  const activeSessions = activeSessionsQuery.data?.items ?? [];
  const latestActiveSession = activeSessions[0];

  if (!latestActiveSession) {
    return <BookingWorkspace key="no-active-session" />;
  }

  const sessionTitle =
    latestActiveSession.title?.trim() ||
    latestActiveSession.bookingContext?.serviceName?.trim() ||
    "Booking conversation";
  const isChoosing = selectedChoice !== null || isNavigating;

  return (
    <>
      <BookingWorkspace key="booking-choice-background" />
      <Modal
        description="You already have an active booking conversation."
        isDismissible={false}
        isOpen
        onClose={() => undefined}
        title="Continue where you left off?"
      >
        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex items-start gap-3 rounded-[10px] border border-border bg-surface-subtle p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
              <ChatIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                  {sessionTitle}
                </p>
                <Badge tone="brand">Active</Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted">
                Resume your most recently active conversation with its saved
                messages and booking details.
              </p>
            </div>
          </div>

          {activeSessions.length > 1 ? (
            <Alert tone="info">
              Continue previous opens only your latest active chat. To resume a
              specific active chat, select it from conversation history.
            </Alert>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              disabled={isChoosing}
              isLoading={selectedChoice === "previous"}
              leadingIcon={<ChatIcon className="size-4" />}
              onClick={() =>
                chooseBooking("previous", latestActiveSession.id)
              }
            >
              Continue previous
            </Button>
            <Button
              disabled={isChoosing}
              isLoading={selectedChoice === "new"}
              leadingIcon={<PlusIcon className="size-4" />}
              onClick={() => chooseBooking("new")}
              variant="secondary"
            >
              Start new chat
            </Button>
          </div>

          <LinkButton
            fullWidth
            href="/conversations"
            leadingIcon={<ConversationsIcon className="size-4" />}
            variant="ghost"
          >
            Open conversation history
          </LinkButton>
        </div>
      </Modal>
    </>
  );
}

function BookingEntrySkeleton() {
  return (
    <div
      className="grid min-h-[calc(100dvh-4rem)] xl:grid-cols-[minmax(0,1fr)_372px]"
      role="status"
    >
      <span className="sr-only">Checking active conversations</span>
      <section className="bg-surface px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-3 border-b border-border pb-5">
            <Skeleton className="size-10 rounded-[10px]" />
            <div className="flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-64 max-w-full" />
            </div>
          </div>
          <Skeleton className="mt-8 h-16 w-3/4 rounded-2xl" />
        </div>
      </section>
      <aside className="border-t border-border bg-canvas px-5 py-6 xl:border-l xl:border-t-0">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-5 h-48 rounded-xl" />
      </aside>
    </div>
  );
}

function BookingEntryError({
  isStartingNew,
  message,
  onRetry,
  onStartNew,
}: {
  isStartingNew: boolean;
  message: string;
  onRetry: () => void;
  onStartNew: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
        <h2 className="text-lg font-semibold text-ink">
          Active conversations could not be checked
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
          <Button
            isLoading={isStartingNew}
            leadingIcon={<PlusIcon className="size-4" />}
            onClick={onStartNew}
          >
            Start new chat anyway
          </Button>
        </div>
      </div>
    </div>
  );
}
