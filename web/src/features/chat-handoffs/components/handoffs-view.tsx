"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { ChatIcon, CheckCircleIcon, MailIcon, PhoneIcon } from "@/components/ui/icons";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { TextAreaField } from "@/components/ui/form-controls";
import { SectionCard } from "@/components/ui/section-card";
import { BusinessRequired } from "@/features/business-settings/components/business-required";
import { useBusinessEvents } from "@/features/business-settings/hooks/use-business-events";
import {
  getGetHandoffThreadQueryKey,
  getListHandoffsQueryKey,
  useGetHandoffThread,
  useListHandoffs,
  useReplyToHandoff,
  useResolveHandoff,
} from "@/generated/api/chat-handoffs/chat-handoffs";
import type { BusinessSummaryResponse, ChatHandoffMessage, ChatHandoffResponse } from "@/generated/api/models";
import { useBrowserTimeZone } from "@/hooks/use-browser-time-zone";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/date-time";

const HANDOFF_POLL_INTERVAL_MS = 30_000;

export function HandoffsView() {
  return <BusinessRequired>{(business) => <HandoffsContent business={business} />}</BusinessRequired>;
}

function HandoffsContent({ business }: { business: BusinessSummaryResponse }) {
  const timeZone = useBrowserTimeZone();
  const isLive = useBusinessEvents(business.id);
  const handoffsQuery = useListHandoffs(business.id, {
    // Poll only while the live channel is down.
    query: { refetchInterval: isLive ? false : HANDOFF_POLL_INTERVAL_MS },
  });
  const handoffs = handoffsQuery.data?.items ?? [];

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Badge className="gap-1.5" tone={isLive ? "success" : "neutral"}>
            <span className={cn("size-1.5 rounded-full bg-current", isLive && "animate-bw-pulse")} />
            {isLive ? "Live" : "Reconnecting"}
          </Badge>
        }
        description="Chats where the assistant asked for a person. Reply in the chat as the business, or get in touch another way, then mark it resolved."
        title="Inbox"
      />

      {handoffsQuery.error ? (
        <Alert tone="danger">{getApiErrorMessage(handoffsQuery.error, "Handoffs could not be loaded.")}</Alert>
      ) : handoffsQuery.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : handoffs.length === 0 ? (
        <EmptyState
          description="When a customer asks for a person or the assistant can't help, the chat shows up here."
          icon={ChatIcon}
          title="Nothing waiting"
        />
      ) : (
        <div className="space-y-4">
          {handoffs.map((handoff) => (
            <HandoffCard businessId={business.id} handoff={handoff} key={handoff.sessionId} timeZone={timeZone} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function HandoffCard({
  businessId,
  handoff,
  timeZone,
}: {
  businessId: string;
  handoff: ChatHandoffResponse;
  timeZone: string;
}) {
  const queryClient = useQueryClient();
  const resolveMutation = useResolveHandoff();
  const [showWholeChat, setShowWholeChat] = useState(false);
  const threadQuery = useGetHandoffThread(businessId, handoff.sessionId, { query: { enabled: showWholeChat } });
  const messages = showWholeChat && threadQuery.data ? threadQuery.data.messages : handoff.recentMessages;

  return (
    <SectionCard
      actions={
        <Button
          isLoading={resolveMutation.isPending}
          leadingIcon={<CheckCircleIcon className="size-4" />}
          onClick={() =>
            resolveMutation.mutate(
              { businessId, sessionId: handoff.sessionId },
              { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getListHandoffsQueryKey(businessId) }) },
            )
          }
          size="sm"
          variant="secondary"
        >
          Mark resolved
        </Button>
      }
      description={handoff.reason ?? "The customer asked for a person."}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {handoff.customer.name}
          <Badge tone="warning">Waiting</Badge>
          {handoff.channel === "SMS" || handoff.channel === "WHATSAPP" ? (
            <Badge tone="neutral">{handoff.channel === "SMS" ? "Text message" : "WhatsApp"}</Badge>
          ) : null}
          <span className="text-xs font-normal text-muted">since {formatDateTime(handoff.requestedAt, timeZone)}</span>
        </span>
      }
    >
      {resolveMutation.error ? (
        <Alert className="mb-4" tone="danger">
          {getApiErrorMessage(resolveMutation.error, "The handoff could not be resolved.")}
        </Alert>
      ) : null}
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft">
        {handoff.customer.email ? (
          <a className="flex items-center gap-1.5 hover:text-brand" href={`mailto:${handoff.customer.email}`}>
            <MailIcon className="size-4 text-brand" /> {handoff.customer.email}
          </a>
        ) : null}
        {handoff.customer.phone ? (
          <a className="flex items-center gap-1.5 hover:text-brand" href={`tel:${handoff.customer.phone}`}>
            <PhoneIcon className="size-4 text-brand" /> {handoff.customer.phone}
          </a>
        ) : null}
      </div>
      {showWholeChat ? null : (
        <Button className="mb-3" isLoading={threadQuery.isFetching} onClick={() => setShowWholeChat(true)} size="sm" variant="ghost">
          Show the whole chat
        </Button>
      )}
      <ol className="space-y-2">
        {messages.map((message) => (
          <MessageBubble customerName={handoff.customer.name} key={message.id} message={message} timeZone={timeZone} />
        ))}
      </ol>
      <ReplyForm businessId={businessId} sessionId={handoff.sessionId} />
    </SectionCard>
  );
}

function MessageBubble({
  customerName,
  message,
  timeZone,
}: {
  customerName: string;
  message: ChatHandoffMessage;
  timeZone: string;
}) {
  const author = message.role === "USER" ? customerName : message.sentBy ? `${message.sentBy} (team)` : "Assistant";

  return (
    <li
      className={cn(
        "max-w-[85%] rounded-xl px-3 py-2 text-sm",
        message.role === "USER"
          ? "ml-auto bg-brand-soft text-ink"
          : message.sentBy
            ? "border border-brand/30 bg-surface text-ink"
            : "border border-border bg-surface-subtle text-ink-soft",
      )}
    >
      <span className="block text-[11px] font-semibold text-muted">
        {author} · {formatDateTime(message.createdAt, timeZone)}
      </span>
      <span className="whitespace-pre-wrap">{message.content}</span>
    </li>
  );
}

/** Replies in the customer's chat under the staff member's first name. */
function ReplyForm({ businessId, sessionId }: { businessId: string; sessionId: string }) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const replyMutation = useReplyToHandoff({
    mutation: {
      onSuccess: () => {
        setContent("");
        void queryClient.invalidateQueries({ queryKey: getListHandoffsQueryKey(businessId) });
        void queryClient.invalidateQueries({ queryKey: getGetHandoffThreadQueryKey(businessId, sessionId) });
      },
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = content.trim();

    if (trimmed) replyMutation.mutate({ businessId, sessionId, data: { content: trimmed } });
  }

  return (
    <form className="mt-4 space-y-2" onSubmit={handleSubmit}>
      <TextAreaField
        hint="The customer sees this in their chat under your first name, and gets it as a text if they're chatting by SMS or WhatsApp."
        id={`reply-${sessionId}`}
        label="Reply as the business"
        maxLength={4_000}
        onChange={(event) => setContent(event.target.value)}
        rows={2}
        value={content}
      />
      {replyMutation.error ? (
        <Alert tone="danger">{getApiErrorMessage(replyMutation.error, "Your reply could not be sent.")}</Alert>
      ) : null}
      <Button disabled={!content.trim()} isLoading={replyMutation.isPending} size="sm" type="submit">
        Send reply
      </Button>
    </form>
  );
}
