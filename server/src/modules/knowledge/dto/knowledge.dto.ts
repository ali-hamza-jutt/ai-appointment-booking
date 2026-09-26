export type KnowledgeSourceKind = "FAQ" | "POLICY" | "PREPARATION" | "OTHER";

export type KnowledgeSourceStatus = "PENDING" | "READY" | "FAILED";

export interface KnowledgeSourceSummary {
  id: string;
  title: string;
  kind: KnowledgeSourceKind;
  /** READY once passages are searchable by meaning; keyword search works from the start. */
  status: KnowledgeSourceStatus;
  lastError: string | null;
  chunkCount: number;
  /** The first few lines, for lists. */
  preview: string;
  embeddedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeSourceResponse extends KnowledgeSourceSummary {
  content: string;
}

export interface KnowledgeSourceListResponse {
  items: KnowledgeSourceSummary[];
}

export interface CreateKnowledgeSourceRequest {
  /** @minLength 2 @maxLength 200 */
  title: string;

  kind?: KnowledgeSourceKind;

  /** Plain text or Markdown. @minLength 10 @maxLength 100000 */
  content: string;
}

export interface UpdateKnowledgeSourceRequest {
  /** @minLength 2 @maxLength 200 */
  title?: string;

  kind?: KnowledgeSourceKind;

  /** @minLength 10 @maxLength 100000 */
  content?: string;
}

export interface KnowledgeSearchRequest {
  /** @minLength 2 @maxLength 500 */
  query: string;
}

export interface KnowledgeSearchResult {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  kind: KnowledgeSourceKind;
  content: string;
  /** Higher is more relevant; only comparable within one search. */
  score: number;
  /** How the passage was found. */
  matchedBy: Array<"meaning" | "keywords">;
}

export interface KnowledgeSearchResponse {
  results: KnowledgeSearchResult[];
}
