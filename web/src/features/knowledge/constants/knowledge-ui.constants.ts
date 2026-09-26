import type { BadgeTone } from "@/components/ui/badge";
import type { KnowledgeSourceKind, KnowledgeSourceStatus } from "@/generated/api/models";

export const KNOWLEDGE_UI_CONSTANTS = {
  MIN_TITLE_LENGTH: 2,
  MAX_TITLE_LENGTH: 200,
  MIN_CONTENT_LENGTH: 10,
  MAX_CONTENT_LENGTH: 100_000,
  MIN_QUERY_LENGTH: 2,
  MAX_QUERY_LENGTH: 500,
  /** Refresh while sources are being indexed so their status updates. */
  INDEXING_POLL_INTERVAL_MS: 5_000,
  UPLOAD_ACCEPT: ".txt,.md,.markdown,text/plain,text/markdown",
  MAX_UPLOAD_BYTES: 200_000,
} as const;

export const KNOWLEDGE_KIND_OPTIONS: ReadonlyArray<{
  value: KnowledgeSourceKind;
  label: string;
  description: string;
}> = [
  { value: "FAQ", label: "FAQ", description: "Common questions: parking, payment, opening hours." },
  { value: "POLICY", label: "Policy", description: "Cancellation, lateness, deposits and refunds." },
  { value: "PREPARATION", label: "Preparation", description: "What customers should do or bring before a visit." },
  { value: "OTHER", label: "Other", description: "Anything else the assistant should know." },
];

export const KNOWLEDGE_KIND_LABELS: Record<KnowledgeSourceKind, string> = Object.fromEntries(
  KNOWLEDGE_KIND_OPTIONS.map((option) => [option.value, option.label]),
) as Record<KnowledgeSourceKind, string>;

export const KNOWLEDGE_STATUS_DISPLAY: Record<
  KnowledgeSourceStatus,
  { label: string; tone: BadgeTone; hint: string }
> = {
  PENDING: { label: "Indexing", tone: "warning", hint: "Searchable by keywords now; smarter search is being prepared." },
  READY: { label: "Ready", tone: "success", hint: "The assistant can use this." },
  FAILED: { label: "Needs retry", tone: "danger", hint: "Indexing failed. Keyword search still works; save again to retry." },
};

export const KNOWLEDGE_MATCH_LABELS = {
  meaning: "Meaning",
  keywords: "Keywords",
} as const;
