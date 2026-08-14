"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  RefreshIcon,
  SparklesIcon,
  UserIcon,
} from "@/components/ui/icons";
import { useChatMessagePolling } from "@/features/conversations/hooks/use-chat-message-polling";
import { useConversationMessages } from "@/features/conversations/hooks/use-conversation-messages";
import {
  toConversationMessageViewModel,
  toConversationSessionViewModel,
} from "@/features/conversations/utils/conversation-format";
import { useGetSession } from "@/generated/api/chat/chat";
import { useBrowserTimeZone } from "@/hooks/use-browser-time-zone";
import { getApiErrorMessage } from "@/lib/api/api-error";

export function ConversationDetail({ sessionId }: { sessionId: string }) {
  const timeZone = useBrowserTimeZone();
  const sessionQuery = useGetSession(sessionId, { query: { retry: false } });
  const messagesQuery = useConversationMessages(sessionId);
  const latestMessageCursor = messagesQuery.data?.pages.at(-1)?.nextCursor;
  const messagePollingQuery = useChatMessagePolling(sessionId, {
    enabled:
      sessionQuery.data?.status === "ACTIVE" && Boolean(messagesQuery.data),
    ...(latestMessageCursor ? { initialCursor: latestMessageCursor } : {}),
  });
  const messages = Array.from(
    new Map(
      [
        ...(messagesQuery.data?.pages.flatMap((page) => page.items) ?? []),
        ...(messagePollingQuery.data?.items ?? []),
      ].map((message) => [message.id, message]),
    ).values(),
  ).map((message) => toConversationMessageViewModel(message, timeZone));

  if (sessionQuery.isPending || messagesQuery.isPending) {
    return <ConversationDetailSkeleton />;
  }

  if (
    sessionQuery.isError ||
    (!messagesQuery.data && messagesQuery.isError) ||
    !sessionQuery.data
  ) {
    const error = sessionQuery.error ?? messagesQuery.error;

    return (
      <ConversationDetailError
        message={getApiErrorMessage(
          error,
          "This conversation could not be loaded. It may no longer be available.",
        )}
        onRetry={() =>
          void Promise.all([sessionQuery.refetch(), messagesQuery.refetch()])
        }
      />
    );
  }

  const session = toConversationSessionViewModel(sessionQuery.data, timeZone);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink"
        href="/conversations"
      >
        <ArrowLeftIcon className="size-4" />
        Back to conversations
      </Link>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <header className="flex items-start gap-3 border-b border-border p-5 sm:px-6">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand">
            <SparklesIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="min-w-0 text-base font-semibold text-ink">
                {session.title}
              </h2>
              <Badge tone={session.statusTone}>{session.statusLabel}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted">{session.preview}</p>
            <p className="mt-1 text-[11px] text-subtle">
              Last updated {session.dateLabel}
            </p>
          </div>
        </header>

        <div className="space-y-5 p-5 sm:p-6">
          {messages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-strong px-5 py-10 text-center">
              <SparklesIcon className="mx-auto size-7 text-subtle" />
              <p className="mt-3 text-sm font-semibold text-ink">No messages yet</p>
              <p className="mt-1 text-xs text-muted">
                This conversation was created but has not started.
              </p>
            </div>
          ) : (
            messages.map((message) => {
              if (message.role === "system") {
                return (
                  <div className="flex justify-center" key={message.id}>
                    <div className="max-w-[90%] rounded-full bg-surface-subtle px-4 py-2 text-center text-xs text-muted">
                      <p className="whitespace-pre-wrap">{message.text}</p>
                      <time className="mt-1 block text-[10px] text-subtle">
                        {message.time}
                      </time>
                    </div>
                  </div>
                );
              }

              const isUser = message.role === "user";

              return (
                <div
                  className={isUser ? "flex justify-end gap-2" : "flex justify-start gap-2"}
                  key={message.id}
                >
                  {!isUser ? (
                    <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                      <SparklesIcon className="size-3.5" />
                    </span>
                  ) : null}
                  <div className={isUser ? "max-w-[82%] text-right" : "max-w-[82%]"}>
                    <div
                      className={
                        isUser
                          ? "whitespace-pre-wrap rounded-2xl rounded-br-[5px] bg-brand px-4 py-3 text-left text-sm leading-6 text-surface"
                          : "whitespace-pre-wrap rounded-2xl rounded-bl-[5px] bg-surface-subtle px-4 py-3 text-sm leading-6 text-ink-soft"
                      }
                    >
                      {message.text}
                    </div>
                    <time
                      className="mt-1 block text-[10px] text-subtle"
                      dateTime={message.createdAt}
                    >
                      {message.time}
                    </time>
                  </div>
                  {isUser ? (
                    <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted">
                      <UserIcon className="size-3.5" />
                    </span>
                  ) : null}
                </div>
              );
            })
          )}

          {messagesQuery.isError ? (
            <Alert tone="danger">
              Additional messages could not be loaded. Try again below.
            </Alert>
          ) : null}

          {messagePollingQuery.isError ? (
            <Alert tone="warning">
              <p>Live message updates are temporarily unavailable.</p>
              <Button
                className="mt-2"
                leadingIcon={<RefreshIcon className="size-3.5" />}
                onClick={() => void messagePollingQuery.refetch()}
                size="sm"
                variant="secondary"
              >
                Retry live updates
              </Button>
            </Alert>
          ) : null}

          {messagesQuery.hasNextPage || messagesQuery.isError ? (
            <div className="flex justify-center pt-2">
              <Button
                isLoading={messagesQuery.isFetchingNextPage}
                leadingIcon={<RefreshIcon className="size-4" />}
                onClick={() =>
                  messagesQuery.isError
                    ? void messagesQuery.refetch()
                    : void messagesQuery.fetchNextPage()
                }
                size="sm"
                variant="secondary"
              >
                {messagesQuery.isFetchingNextPage
                  ? "Loading…"
                  : messagesQuery.isError
                    ? "Retry"
                    : "Load more messages"}
              </Button>
            </div>
          ) : null}
        </div>

        {session.status === "ACTIVE" ? (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-brand-soft px-5 py-3 sm:px-6">
            <p className="text-xs font-semibold text-brand">
              This conversation is active and updates automatically.
            </p>
            <LinkButton
              href={`/book?sessionId=${encodeURIComponent(session.id)}`}
              leadingIcon={<ArrowRightIcon className="size-4" />}
              size="sm"
            >
              Resume booking
            </LinkButton>
          </footer>
        ) : (
          <footer className="flex items-center gap-2 border-t border-border bg-success-soft px-5 py-3 text-xs font-semibold text-success-strong sm:px-6">
            <CheckCircleIcon className="size-4" />
            This conversation is closed and read-only.
          </footer>
        )}
      </section>
    </div>
  );
}

function ConversationDetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8" role="status">
      <span className="sr-only">Loading conversation</span>
      <Skeleton className="mb-5 h-5 w-40" />
      <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex gap-3 border-b border-border pb-5">
          <Skeleton className="size-10 rounded-[10px]" />
          <div className="flex-1">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="mt-2 h-3 w-3/5" />
          </div>
        </div>
        <div className="space-y-5 pt-6">
          <Skeleton className="h-16 w-3/4 rounded-2xl" />
          <Skeleton className="ml-auto h-14 w-2/3 rounded-2xl" />
          <Skeleton className="h-20 w-4/5 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

function ConversationDetailError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink"
        href="/conversations"
      >
        <ArrowLeftIcon className="size-4" />
        Back to conversations
      </Link>
      <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
        <Alert tone="danger">{message}</Alert>
        <Button
          className="mt-4"
          leadingIcon={<RefreshIcon className="size-4" />}
          onClick={onRetry}
          variant="secondary"
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
