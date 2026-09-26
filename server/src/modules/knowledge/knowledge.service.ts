import { createHash } from "node:crypto";

import { env } from "../../config/env.js";
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  KNOWLEDGE_CONSTANTS,
} from "../../constants/app.constants.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../config/logger.js";
import {
  type EmbeddingProvider,
  MistralEmbeddingProvider,
} from "../../integrations/ai/providers/mistral-embedding.provider.js";
import { AppError } from "../../middleware/app-error.js";
import { assertUuid } from "../../utils/identifiers.js";
import { normalizeWhitespace } from "../../utils/text.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { chunkText } from "./chunker.js";
import { type KnowledgeCandidate, knowledgeDal } from "./dal/knowledge.dal.js";
import type {
  CreateKnowledgeSourceRequest,
  KnowledgeSearchResponse,
  KnowledgeSearchResult,
  KnowledgeSourceListResponse,
  KnowledgeSourceResponse,
  KnowledgeSourceSummary,
  UpdateKnowledgeSourceRequest,
} from "./dto/knowledge.dto.js";

type SourceRecord = NonNullable<Awaited<ReturnType<typeof knowledgeDal.findSource>>>;

const MIN_TITLE_LENGTH = 2;
const MIN_CONTENT_LENGTH = 10;
const MIN_QUERY_LENGTH = 2;

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Keeps line breaks (they carry structure for chunking) but trims noise. */
function normalizeContent(content: string): string {
  return content
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export class KnowledgeService {
  public constructor(private readonly embedder: EmbeddingProvider | null) {}

  public async listSources(businessId: string): Promise<KnowledgeSourceListResponse> {
    const sources = await knowledgeDal.listSources(businessId);

    return { items: sources.map((source) => this.toSummary(source)) };
  }

  public async getSource(businessId: string, sourceId: string): Promise<KnowledgeSourceResponse> {
    return this.toResponse(await this.findSourceOrThrow(businessId, sourceId));
  }

  public async createSource(
    businessId: string,
    request: CreateKnowledgeSourceRequest,
  ): Promise<KnowledgeSourceResponse> {
    const title = this.normalizeTitle(request.title);
    const content = this.normalizeContentOrThrow(request.content);

    if ((await knowledgeDal.countSources(businessId)) >= KNOWLEDGE_CONSTANTS.MAX_SOURCES_PER_BUSINESS) {
      throw new AppError(409, ERROR_CODES.KNOWLEDGE_LIMIT_REACHED, ERROR_MESSAGES.KNOWLEDGE_LIMIT_REACHED);
    }

    const chunks = chunkText(content);
    const contentHash = hashContent(content);
    const source = await prisma.$transaction(async (transaction) => {
      const created = await knowledgeDal.createSource(transaction, {
        businessId,
        title,
        kind: request.kind ?? "FAQ",
        content,
        contentHash,
        chunkCount: chunks.length,
      });

      await knowledgeDal.replaceChunks(transaction, businessId, created.id, chunks);
      await knowledgeDal.recordSourceChanged(transaction, businessId, created.id, contentHash);

      return created;
    });

    return this.toResponse(source);
  }

  /** New content is re-chunked at once and re-embedded in the background. */
  public async updateSource(
    businessId: string,
    sourceId: string,
    request: UpdateKnowledgeSourceRequest,
  ): Promise<KnowledgeSourceResponse> {
    const existing = await this.findSourceOrThrow(businessId, sourceId);
    const title = request.title !== undefined ? this.normalizeTitle(request.title) : undefined;
    const content =
      request.content !== undefined ? this.normalizeContentOrThrow(request.content) : undefined;
    const contentHash = content !== undefined ? hashContent(content) : existing.contentHash;
    const contentChanged = content !== undefined && contentHash !== existing.contentHash;

    const source = await prisma.$transaction(async (transaction) => {
      if (contentChanged) {
        const chunks = chunkText(content);

        await knowledgeDal.replaceChunks(transaction, businessId, sourceId, chunks);
        await knowledgeDal.recordSourceChanged(transaction, businessId, sourceId, contentHash);

        return knowledgeDal.updateSource(transaction, businessId, sourceId, {
          ...(title !== undefined ? { title } : {}),
          ...(request.kind !== undefined ? { kind: request.kind } : {}),
          content,
          contentHash,
          chunkCount: chunks.length,
          status: "PENDING",
          lastError: null,
          embeddedAt: null,
        });
      }

      return knowledgeDal.updateSource(transaction, businessId, sourceId, {
        ...(title !== undefined ? { title } : {}),
        ...(request.kind !== undefined ? { kind: request.kind } : {}),
      });
    });

    return this.toResponse(source);
  }

  public async deleteSource(businessId: string, sourceId: string): Promise<void> {
    assertUuid("sourceId", sourceId);

    if (!(await knowledgeDal.deleteSource(businessId, sourceId))) this.throwNotFound();
  }

  /**
   * Embeds a source's passages. Runs in the worker after a change; a stale
   * hash means a newer edit superseded this one, so it is skipped.
   */
  public async indexSource(businessId: string, sourceId: string, contentHash: string): Promise<void> {
    const source = await knowledgeDal.findSource(businessId, sourceId);

    if (!source || source.contentHash !== contentHash) return;

    if (!this.embedder) {
      // Without an embedding model the passages are still found by keywords.
      await knowledgeDal.markEmbedded(businessId, sourceId, contentHash, new Date());
      return;
    }

    try {
      const pending = await knowledgeDal.listUnembeddedChunks(businessId, sourceId);

      for (let start = 0; start < pending.length; start += KNOWLEDGE_CONSTANTS.EMBED_BATCH_SIZE) {
        const batch = pending.slice(start, start + KNOWLEDGE_CONSTANTS.EMBED_BATCH_SIZE);
        const vectors = await this.embedder.embed(
          batch.map((chunk) => chunk.content),
          businessId,
        );

        for (const [index, chunk] of batch.entries()) {
          const vector = vectors[index];

          if (vector?.length !== KNOWLEDGE_CONSTANTS.EMBEDDING_DIMENSIONS) {
            throw new Error(`Embedding has ${vector?.length ?? 0} dimensions`);
          }

          await knowledgeDal.saveEmbedding(businessId, chunk.id, vector);
        }
      }

      await knowledgeDal.markEmbedded(businessId, sourceId, contentHash, new Date());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Embedding failed";

      await knowledgeDal.markFailed(businessId, sourceId, contentHash, message);
      throw error;
    }
  }

  /**
   * Finds the passages most relevant to a question: nearest by meaning when
   * embeddings are available, plus keyword matches, merged by rank.
   */
  public async search(businessId: string, query: string): Promise<KnowledgeSearchResponse> {
    const text = normalizeWhitespace(query).slice(0, KNOWLEDGE_CONSTANTS.MAX_QUERY_LENGTH);

    if (text.length < MIN_QUERY_LENGTH) {
      throwRequestValidationError("query", `Query must be at least ${MIN_QUERY_LENGTH} characters`);
    }

    const [byMeaning, byKeywords] = await Promise.all([
      this.searchByMeaning(businessId, text),
      knowledgeDal.searchByKeywords(businessId, text, KNOWLEDGE_CONSTANTS.SEARCH_CANDIDATES),
    ]);

    return { results: this.fuse(byMeaning, byKeywords) };
  }

  private async searchByMeaning(businessId: string, text: string): Promise<KnowledgeCandidate[]> {
    if (!this.embedder) return [];

    try {
      const [vector] = await this.embedder.embed([text], businessId);

      if (vector?.length !== KNOWLEDGE_CONSTANTS.EMBEDDING_DIMENSIONS) return [];

      return await knowledgeDal.searchByVector(businessId, vector, KNOWLEDGE_CONSTANTS.SEARCH_CANDIDATES);
    } catch (error) {
      // Keyword results still answer the question when the embedder is down.
      logger.warn({ err: error, businessId }, "Knowledge query embedding failed");
      return [];
    }
  }

  /** Reciprocal rank fusion: rewards passages ranked well by either method. */
  private fuse(byMeaning: KnowledgeCandidate[], byKeywords: KnowledgeCandidate[]): KnowledgeSearchResult[] {
    const merged = new Map<string, KnowledgeSearchResult>();
    const add = (candidates: KnowledgeCandidate[], method: "meaning" | "keywords") => {
      for (const [rank, candidate] of candidates.entries()) {
        const score = 1 / (KNOWLEDGE_CONSTANTS.RRF_K + rank + 1);
        const existing = merged.get(candidate.chunkId);

        if (existing) {
          existing.score += score;
          existing.matchedBy.push(method);
        } else {
          merged.set(candidate.chunkId, {
            chunkId: candidate.chunkId,
            sourceId: candidate.sourceId,
            sourceTitle: candidate.sourceTitle,
            kind: candidate.kind,
            content: candidate.content,
            score,
            matchedBy: [method],
          });
        }
      }
    };

    add(byMeaning, "meaning");
    add(byKeywords, "keywords");

    return [...merged.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, KNOWLEDGE_CONSTANTS.SEARCH_RESULTS)
      .map((result) => ({ ...result, score: Number(result.score.toFixed(6)) }));
  }

  private async findSourceOrThrow(businessId: string, sourceId: string): Promise<SourceRecord> {
    assertUuid("sourceId", sourceId);

    const source = await knowledgeDal.findSource(businessId, sourceId);

    if (!source) this.throwNotFound();

    return source;
  }

  private normalizeTitle(title: string): string {
    const normalized = normalizeWhitespace(title);

    if (normalized.length < MIN_TITLE_LENGTH || normalized.length > KNOWLEDGE_CONSTANTS.MAX_TITLE_LENGTH) {
      throwRequestValidationError(
        "title",
        `Title must be ${MIN_TITLE_LENGTH}-${KNOWLEDGE_CONSTANTS.MAX_TITLE_LENGTH} characters`,
      );
    }

    return normalized;
  }

  private normalizeContentOrThrow(content: string): string {
    const normalized = normalizeContent(content);

    if (normalized.length < MIN_CONTENT_LENGTH || normalized.length > KNOWLEDGE_CONSTANTS.MAX_CONTENT_LENGTH) {
      throwRequestValidationError(
        "content",
        `Content must be ${MIN_CONTENT_LENGTH}-${KNOWLEDGE_CONSTANTS.MAX_CONTENT_LENGTH} characters`,
      );
    }

    return normalized;
  }

  private toSummary(source: SourceRecord): KnowledgeSourceSummary {
    const preview = normalizeWhitespace(source.content.replace(/^\s*(?:#{1,6}|[-*>])\s+/gm, ""));

    return {
      id: source.id,
      title: source.title,
      kind: source.kind,
      status: source.status,
      lastError: source.lastError,
      chunkCount: source.chunkCount,
      preview:
        preview.length > KNOWLEDGE_CONSTANTS.PREVIEW_LENGTH
          ? `${preview.slice(0, KNOWLEDGE_CONSTANTS.PREVIEW_LENGTH).trimEnd()}…`
          : preview,
      embeddedAt: source.embeddedAt,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    };
  }

  private toResponse(source: SourceRecord): KnowledgeSourceResponse {
    return { ...this.toSummary(source), content: source.content };
  }

  private throwNotFound(): never {
    throw new AppError(404, ERROR_CODES.KNOWLEDGE_SOURCE_NOT_FOUND, ERROR_MESSAGES.KNOWLEDGE_SOURCE_NOT_FOUND);
  }
}

const embedder = env.MISTRAL_API_KEY
  ? new MistralEmbeddingProvider({
      apiKey: env.MISTRAL_API_KEY,
      model: env.MISTRAL_EMBED_MODEL,
      apiUrl: env.MISTRAL_API_URL,
      timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    })
  : null;

export const knowledgeService = new KnowledgeService(embedder);
