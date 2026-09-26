"use client";

import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import { SearchIcon } from "@/components/ui/icons";
import { SectionCard } from "@/components/ui/section-card";
import {
  KNOWLEDGE_KIND_LABELS,
  KNOWLEDGE_MATCH_LABELS,
  KNOWLEDGE_UI_CONSTANTS,
} from "@/features/knowledge/constants/knowledge-ui.constants";
import { useSearchKnowledge } from "@/generated/api/knowledge-base/knowledge-base";
import { getApiErrorMessage } from "@/lib/api/api-error";

/** Lets the owner ask a question and see the passages the assistant would read. */
export function KnowledgeSearchCard({ businessId }: { businessId: string }) {
  const searchMutation = useSearchKnowledge();
  const [query, setQuery] = useState("");
  const results = searchMutation.data?.results;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = query.trim();

    if (trimmed.length < KNOWLEDGE_UI_CONSTANTS.MIN_QUERY_LENGTH) return;

    searchMutation.mutate({ businessId, data: { query: trimmed } });
  }

  return (
    <SectionCard
      description="Ask a question the way a customer would to check what the assistant finds."
      title="Try a question"
    >
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate onSubmit={handleSubmit}>
        <div className="min-w-0 flex-1">
          <TextField
            id="knowledge-test-query"
            label="Customer question"
            maxLength={KNOWLEDGE_UI_CONSTANTS.MAX_QUERY_LENGTH}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Can I cancel the day before?"
            value={query}
          />
        </div>
        <Button
          disabled={query.trim().length < KNOWLEDGE_UI_CONSTANTS.MIN_QUERY_LENGTH}
          isLoading={searchMutation.isPending}
          leadingIcon={<SearchIcon className="size-4" />}
          type="submit"
        >
          Search
        </Button>
      </form>

      {searchMutation.error ? (
        <Alert className="mt-4" tone="danger">
          {getApiErrorMessage(searchMutation.error, "The search could not be run.")}
        </Alert>
      ) : results && results.length === 0 ? (
        <Alert className="mt-4" tone="info">
          Nothing matches. The assistant will say it doesn&rsquo;t know and offer to pass the question on.
        </Alert>
      ) : results ? (
        <ol className="mt-4 space-y-3">
          {results.map((result, index) => (
            <li className="rounded-[10px] border border-border bg-surface-subtle p-4" key={result.chunkId}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-subtle">#{index + 1}</span>
                <p className="text-sm font-semibold text-ink">{result.sourceTitle}</p>
                <Badge tone="neutral">{KNOWLEDGE_KIND_LABELS[result.kind]}</Badge>
                {result.matchedBy.map((method) => (
                  <Badge key={method} tone="brand">
                    {KNOWLEDGE_MATCH_LABELS[method]}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm leading-6 text-muted">{result.content}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </SectionCard>
  );
}
