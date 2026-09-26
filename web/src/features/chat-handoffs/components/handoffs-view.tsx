"use client";

import { useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { ChatIcon, CheckCircleIcon, MailIcon, PhoneIcon } from "@/components/ui/icons";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { BusinessRequired } from "@/features/business-settings/components/business-required";
import {
  getListHandoffsQueryKey,
  useListHandoffs,
  useResolveHandoff,
} from "@/generated/api/chat-handoffs/chat-handoffs";
import type { BusinessSummaryResponse, ChatHandoffResponse } from "@/generated/api/models";
import { useBrowserTimeZone } from "@/hooks/use-browser-time-zone";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/date-time";

export function HandoffsView() {
  return <BusinessRequired>{(business) => <HandoffsContent business={business} />}</BusinessRequired>;
}

function HandoffsContent({ business }: { business: BusinessSummaryResponse }) {
  const timeZone = useBrowserTimeZone();
  const handoffsQuery = useListHandoffs(business.id);
  const handoffs = handoffsQuery.data?.items ?? [];

  return (
    <PageContainer>
      <PageHeader
        description="Chats where the assistant asked for a person. Get in touch with the customer, then mark it resolved."
        title="Chat handoffs"
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
        <a className="flex items-center gap-1.5 hover:text-brand" href={`mailto:${handoff.customer.email}`}>
          <MailIcon className="size-4 text-brand" /> {handoff.customer.email}
        </a>
        {handoff.customer.phone ? (
          <a className="flex items-center gap-1.5 hover:text-brand" href={`tel:${handoff.customer.phone}`}>
            <PhoneIcon className="size-4 text-brand" /> {handoff.customer.phone}
          </a>
        ) : null}
      </div>
      <ol className="space-y-2">
        {handoff.recentMessages.map((message, index) => (
          <li
            className={cn(
              "max-w-[85%] rounded-xl px-3 py-2 text-sm",
              message.role === "USER"
                ? "ml-auto bg-brand-soft text-ink"
                : "border border-border bg-surface-subtle text-ink-soft",
            )}
            key={index}
          >
            <span className="block text-[11px] font-semibold text-muted">
              {message.role === "USER" ? handoff.customer.name : "Assistant"} · {formatDateTime(message.createdAt, timeZone)}
            </span>
            {message.content}
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
