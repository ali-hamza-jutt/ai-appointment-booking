"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import {
  ArrowRightIcon,
  ChatIcon,
  ConversationsIcon,
  PlusIcon,
  RefreshIcon,
} from "@/components/ui/icons";
import { CONVERSATION_UI_CONSTANTS } from "@/features/conversations/constants/conversation-ui.constants";
import { useConversationSessions } from "@/features/conversations/hooks/use-conversation-sessions";
import type { ConversationFilter } from "@/features/conversations/types/conversation-ui";
import { toConversationSessionViewModel } from "@/features/conversations/utils/conversation-format";
import { useBrowserTimeZone } from "@/hooks/use-browser-time-zone";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { cn } from "@/lib/utils/cn";

export function ConversationsList() {
  const [activeFilter, setActiveFilter] = useState<ConversationFilter>("ALL");
  const timeZone = useBrowserTimeZone();
  const sessionsQuery = useConversationSessions(activeFilter);
  const sessions = Array.from(
    new Map(
      (sessionsQuery.data?.pages.flatMap((page) => page.items) ?? []).map(
        (session) => [session.id, session],
      ),
    ).values(),
  ).map((session) => toConversationSessionViewModel(session, timeZone));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-ink">
            Conversation history
          </h2>
          <p className="mt-1 text-sm text-muted">
            Return to active booking chats or review completed conversations.
          </p>
        </div>
        <LinkButton href="/book?new=true" leadingIcon={<PlusIcon className="size-4" />}>
          New conversation
        </LinkButton>
      </div>

      <div
        aria-label="Filter conversations by status"
        className="mb-5 flex gap-1 overflow-x-auto border-b border-border"
        role="tablist"
      >
        {CONVERSATION_UI_CONSTANTS.FILTERS.map((filter) => (
          <button
            aria-controls="conversation-results"
            aria-selected={activeFilter === filter.value}
            className={cn(
              "relative min-h-11 shrink-0 px-4 text-sm font-semibold transition-colors",
              activeFilter === filter.value
                ? "text-brand"
                : "text-muted hover:text-ink",
            )}
            key={filter.value}
            onClick={() => setActiveFilter(filter.value)}
            role="tab"
            type="button"
          >
            {filter.label}
            {activeFilter === filter.value ? (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand" />
            ) : null}
          </button>
        ))}
      </div>

      <section id="conversation-results" role="tabpanel">
        {sessionsQuery.isPending ? (
          <ConversationListSkeleton />
        ) : sessionsQuery.isError && sessions.length === 0 ? (
          <ConversationListError
            message={getApiErrorMessage(
              sessionsQuery.error,
              "Conversations could not be loaded. Please try again.",
            )}
            onRetry={() => void sessionsQuery.refetch()}
          />
        ) : sessions.length > 0 ? (
          <>
            {sessionsQuery.isError ? (
              <Alert className="mb-4" tone="danger">
                Additional conversations could not be loaded. You can retry below.
              </Alert>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
              {sessions.map((session, index) => (
                <Link
                  className={cn(
                    "group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-surface-subtle sm:px-5",
                    index < sessions.length - 1 && "border-b border-border",
                  )}
                  href={`/conversations/${session.id}`}
                  key={session.id}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                    <ChatIcon className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink group-hover:text-brand">
                        {session.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-subtle">
                        {session.dateLabel}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted">
                      {session.preview}
                    </span>
                    <Badge className="mt-2" tone={session.statusTone}>
                      {session.statusLabel}
                    </Badge>
                  </span>
                  <ArrowRightIcon className="size-4 shrink-0 text-subtle group-hover:text-brand" />
                </Link>
              ))}
            </div>

            {sessionsQuery.hasNextPage || sessionsQuery.isError ? (
              <div className="mt-6 flex justify-center">
                <Button
                  isLoading={sessionsQuery.isFetchingNextPage}
                  leadingIcon={<RefreshIcon className="size-4" />}
                  onClick={() =>
                    sessionsQuery.isError
                      ? void sessionsQuery.refetch()
                      : void sessionsQuery.fetchNextPage()
                  }
                  variant="secondary"
                >
                  {sessionsQuery.isFetchingNextPage
                    ? "Loading…"
                    : sessionsQuery.isError
                      ? "Retry"
                      : "Load more"}
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
            <ConversationsIcon className="mx-auto size-8 text-subtle" />
            <h3 className="mt-4 text-sm font-semibold text-ink">
              No conversations here
            </h3>
            <p className="mt-1 text-sm text-muted">
              Booking conversations matching this status will appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function ConversationListSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-surface"
      role="status"
    >
      <span className="sr-only">Loading conversations</span>
      {[0, 1, 2, 3].map((item) => (
        <div
          className="flex items-center gap-4 border-b border-border px-4 py-4 last:border-b-0 sm:px-5"
          key={item}
        >
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="mt-2 h-3 w-3/5" />
            <Skeleton className="mt-2 h-5 w-14 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ConversationListError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6 text-center shadow-card">
      <Alert className="text-left" tone="danger">
        {message}
      </Alert>
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
