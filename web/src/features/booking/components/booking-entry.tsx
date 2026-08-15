"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { PlusIcon, RefreshIcon } from "@/components/ui/icons";
import { BookingWorkspace } from "@/features/booking/components/booking-workspace";
import {
  getListSessionsQueryKey,
  useCreateSession,
  useListSessions,
} from "@/generated/api/chat/chat";
import { getApiErrorMessage } from "@/lib/api/api-error";

interface BookingEntryProps {
  initialSessionId?: string;
  newBookingKey?: string;
  shouldStartNew: boolean;
}

export function BookingEntry({
  initialSessionId,
  newBookingKey,
  shouldStartNew,
}: BookingEntryProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const createSessionMutation = useCreateSession();
  const requestedNewBookingRef = useRef<string | null>(null);
  const [locallyCreatedSessionId, setLocallyCreatedSessionId] = useState<
    string | null
  >(null);
  const replacementKey = newBookingKey ?? "new-booking";
  const shouldCheckActiveSessions =
    !initialSessionId &&
    !shouldStartNew &&
    !locallyCreatedSessionId;
  const activeSessionsQuery = useListSessions(
    { limit: 1, status: "ACTIVE" },
    {
      query: {
        enabled: shouldCheckActiveSessions,
        refetchOnMount: "always",
        retry: false,
        staleTime: 0,
      },
    },
  );

  const startNewBooking = useCallback(
    (requestKey: string) => {
      if (requestedNewBookingRef.current === requestKey) return;

      requestedNewBookingRef.current = requestKey;
      createSessionMutation.mutate(
        { data: { replaceActive: true } },
        {
          onSuccess: (session) => {
            void queryClient.invalidateQueries({
              queryKey: getListSessionsQueryKey(),
            });
            router.replace(
              `/book?sessionId=${encodeURIComponent(session.id)}`,
            );
          },
        },
      );
    },
    [createSessionMutation, queryClient, router],
  );

  useEffect(() => {
    if (shouldStartNew && !initialSessionId) {
      startNewBooking(replacementKey);
    }
  }, [initialSessionId, replacementKey, shouldStartNew, startNewBooking]);

  if (initialSessionId) {
    return (
      <BookingWorkspace
        initialSessionId={initialSessionId}
        key={initialSessionId}
      />
    );
  }

  if (shouldStartNew) {
    if (createSessionMutation.isError) {
      return (
        <BookingEntryError
          message={getApiErrorMessage(
            createSessionMutation.error,
            "A new booking could not be started. Please try again.",
          )}
          onRetry={() => {
            requestedNewBookingRef.current = null;
            createSessionMutation.reset();
            startNewBooking(replacementKey);
          }}
          onSecondary={() => router.replace("/book")}
          secondaryLabel="Return to current booking"
          title="New booking could not be started"
        />
      );
    }

    return <BookingEntrySkeleton label="Starting a new booking" />;
  }

  if (locallyCreatedSessionId) {
    return (
      <BookingWorkspace
        key="no-active-session"
        onSessionCreated={setLocallyCreatedSessionId}
      />
    );
  }

  if (
    activeSessionsQuery.isPending ||
    !activeSessionsQuery.isFetchedAfterMount
  ) {
    return <BookingEntrySkeleton label="Opening your booking" />;
  }

  if (activeSessionsQuery.isError) {
    return (
      <BookingEntryError
        message={getApiErrorMessage(
          activeSessionsQuery.error,
          "BookWise could not check for active conversations. Please try again.",
        )}
        onRetry={() => void activeSessionsQuery.refetch()}
        onSecondary={() =>
          router.replace(`/book?new=${crypto.randomUUID()}`)
        }
        secondaryLabel="Start new booking"
        title="Booking could not be opened"
      />
    );
  }

  const activeSessions = activeSessionsQuery.data?.items ?? [];
  const latestActiveSession = activeSessions[0];

  if (!latestActiveSession) {
    return (
      <BookingWorkspace
        key="no-active-session"
        onSessionCreated={setLocallyCreatedSessionId}
      />
    );
  }

  return (
    <BookingWorkspace
      initialSessionId={latestActiveSession.id}
      key={latestActiveSession.id}
    />
  );
}

function BookingEntrySkeleton({ label }: { label: string }) {
  return (
    <div
      className="grid min-h-[calc(100dvh-4rem)] xl:grid-cols-[minmax(0,1fr)_372px]"
      role="status"
    >
      <span className="sr-only">{label}</span>
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
  message,
  onRetry,
  onSecondary,
  secondaryLabel,
  title,
}: {
  message: string;
  onRetry: () => void;
  onSecondary: () => void;
  secondaryLabel: string;
  title: string;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
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
            leadingIcon={
              secondaryLabel === "Start new booking" ? (
                <PlusIcon className="size-4" />
              ) : undefined
            }
            onClick={onSecondary}
          >
            {secondaryLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
