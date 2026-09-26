"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { BookIcon, EditIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { BusinessRequired } from "@/features/business-settings/components/business-required";
import { canManageBusiness } from "@/features/business-settings/utils/business-permissions";
import { KnowledgeSearchCard } from "@/features/knowledge/components/knowledge-search-card";
import { KnowledgeSourceModal } from "@/features/knowledge/components/knowledge-source-modal";
import {
  KNOWLEDGE_KIND_LABELS,
  KNOWLEDGE_STATUS_DISPLAY,
  KNOWLEDGE_UI_CONSTANTS,
} from "@/features/knowledge/constants/knowledge-ui.constants";
import {
  getListKnowledgeSourcesQueryKey,
  useDeleteKnowledgeSource,
  useListKnowledgeSources,
} from "@/generated/api/knowledge-base/knowledge-base";
import type { BusinessSummaryResponse, KnowledgeSourceSummary } from "@/generated/api/models";
import { useBrowserTimeZone } from "@/hooks/use-browser-time-zone";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { formatDateTime } from "@/lib/utils/date-time";

type EditorState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; source: KnowledgeSourceSummary };

export function KnowledgeView() {
  return <BusinessRequired>{(business) => <KnowledgeContent business={business} />}</BusinessRequired>;
}

function KnowledgeContent({ business }: { business: BusinessSummaryResponse }) {
  const queryClient = useQueryClient();
  const timeZone = useBrowserTimeZone();
  const sourcesQuery = useListKnowledgeSources(business.id, {
    query: {
      // Keep polling only while something is still being indexed.
      refetchInterval: (query) =>
        query.state.data?.items.some((source) => source.status === "PENDING")
          ? KNOWLEDGE_UI_CONSTANTS.INDEXING_POLL_INTERVAL_MS
          : false,
    },
  });
  const deleteMutation = useDeleteKnowledgeSource();
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [sourceToDelete, setSourceToDelete] = useState<KnowledgeSourceSummary | null>(null);
  const canEdit = canManageBusiness(business.role);
  const sources = sourcesQuery.data?.items ?? [];

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: getListKnowledgeSourcesQueryKey(business.id) });
  }

  function handleDelete() {
    if (!sourceToDelete) return;

    deleteMutation.mutate(
      { businessId: business.id, sourceId: sourceToDelete.id },
      {
        onSuccess: () => {
          setSourceToDelete(null);
          refresh();
        },
      },
    );
  }

  return (
    <PageContainer>
      <PageHeader
        actions={
          canEdit ? (
            <Button leadingIcon={<PlusIcon className="size-4" />} onClick={() => setEditor({ mode: "create" })}>
              Add knowledge
            </Button>
          ) : null
        }
        description="FAQs, policies and preparation notes the booking assistant uses to answer customers. It never makes answers up."
        title="Knowledge base"
      />

      {sourcesQuery.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : sourcesQuery.isError ? (
        <Alert tone="danger">{getApiErrorMessage(sourcesQuery.error, "Knowledge could not be loaded.")}</Alert>
      ) : sources.length === 0 ? (
        <EmptyState
          action={
            canEdit ? (
              <Button leadingIcon={<PlusIcon className="size-4" />} onClick={() => setEditor({ mode: "create" })}>
                Add your first source
              </Button>
            ) : null
          }
          description={
            canEdit
              ? "Paste your cancellation policy, parking directions or what to bring, and the assistant can answer those questions."
              : "An owner or manager can add knowledge."
          }
          icon={BookIcon}
          title="Nothing here yet"
        />
      ) : (
        <div className="space-y-6">
          <SectionCard
            description={`${sources.length} ${sources.length === 1 ? "source" : "sources"}`}
            title="Sources"
          >
            <ul className="divide-y divide-border">
              {sources.map((source) => (
                <SourceRow
                  canEdit={canEdit}
                  key={source.id}
                  onDelete={() => {
                    deleteMutation.reset();
                    setSourceToDelete(source);
                  }}
                  onEdit={() => setEditor({ mode: "edit", source })}
                  source={source}
                  timeZone={timeZone}
                />
              ))}
            </ul>
          </SectionCard>

          <KnowledgeSearchCard businessId={business.id} />
        </div>
      )}

      {editor.mode !== "closed" ? (
        <KnowledgeSourceModal
          businessId={business.id}
          onClose={() => setEditor({ mode: "closed" })}
          onSaved={() => {
            setEditor({ mode: "closed" });
            refresh();
          }}
          {...(editor.mode === "edit" ? { source: editor.source } : {})}
        />
      ) : null}

      <Modal
        description="The assistant stops using it straight away. This can't be undone."
        isOpen={Boolean(sourceToDelete)}
        onClose={() => !deleteMutation.isPending && setSourceToDelete(null)}
        title={`Delete ${sourceToDelete?.title ?? "source"}?`}
      >
        <div className="space-y-4 p-5 sm:p-6">
          {deleteMutation.error ? (
            <Alert tone="danger">{getApiErrorMessage(deleteMutation.error, "The source could not be deleted.")}</Alert>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button disabled={deleteMutation.isPending} onClick={() => setSourceToDelete(null)} variant="secondary">
              Keep it
            </Button>
            <Button
              isLoading={deleteMutation.isPending}
              leadingIcon={<TrashIcon className="size-4" />}
              onClick={handleDelete}
              variant="danger"
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}

function SourceRow({
  canEdit,
  onDelete,
  onEdit,
  source,
  timeZone,
}: {
  canEdit: boolean;
  onDelete: () => void;
  onEdit: () => void;
  source: KnowledgeSourceSummary;
  timeZone: string;
}) {
  const status = KNOWLEDGE_STATUS_DISPLAY[source.status];

  return (
    <li className="flex flex-wrap items-start gap-3 py-4 first:pt-0 last:pb-0">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand">
        <BookIcon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink">{source.title}</p>
          <Badge tone="neutral">{KNOWLEDGE_KIND_LABELS[source.kind]}</Badge>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted">{source.preview}</p>
        <p className="mt-1 text-xs text-subtle">
          {source.chunkCount} {source.chunkCount === 1 ? "passage" : "passages"} · Updated{" "}
          {formatDateTime(source.updatedAt, timeZone)}
        </p>
        {source.status === "FAILED" ? (
          <p className="mt-1 text-xs text-danger">{status.hint}</p>
        ) : null}
      </div>
      {canEdit ? (
        <div className="flex items-center gap-1">
          <Button aria-label={`Edit ${source.title}`} onClick={onEdit} size="sm" variant="ghost">
            <EditIcon className="size-4" />
          </Button>
          <Button aria-label={`Delete ${source.title}`} onClick={onDelete} size="sm" variant="ghost">
            <TrashIcon className="size-4" />
          </Button>
        </div>
      ) : null}
    </li>
  );
}
