import { randomUUID } from "node:crypto";

import { KNOWLEDGE_CONSTANTS } from "../../../constants/app.constants.js";
import type { KnowledgeSourceKind, KnowledgeSourceStatus } from "../../../generated/prisma/client.js";
import { prisma, type DbClient, type TransactionClient } from "../../../infrastructure/database/prisma.js";
import type { KnowledgeTextChunk } from "../chunker.js";

export const knowledgeSourceSelect = {
  id: true,
  title: true,
  kind: true,
  content: true,
  contentHash: true,
  status: true,
  lastError: true,
  chunkCount: true,
  embeddedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface KnowledgeCandidate {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  kind: KnowledgeSourceKind;
  content: string;
  score: number;
}

/** pgvector's text form: [0.1,0.2,...]. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.map((value) => (Number.isFinite(value) ? value : 0)).join(",")}]`;
}

export class KnowledgeDal {
  public listSources(businessId: string) {
    return prisma.knowledgeSource.findMany({
      where: { businessId },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: knowledgeSourceSelect,
    });
  }

  public findSource(businessId: string, sourceId: string, client: DbClient = prisma) {
    return client.knowledgeSource.findFirst({ where: { id: sourceId, businessId }, select: knowledgeSourceSelect });
  }

  public countSources(businessId: string): Promise<number> {
    return prisma.knowledgeSource.count({ where: { businessId } });
  }

  public createSource(
    transaction: TransactionClient,
    data: {
      businessId: string;
      title: string;
      kind: KnowledgeSourceKind;
      content: string;
      contentHash: string;
      chunkCount: number;
    },
  ) {
    return transaction.knowledgeSource.create({
      data: { id: randomUUID(), ...data, status: "PENDING" },
      select: knowledgeSourceSelect,
    });
  }

  public updateSource(
    transaction: TransactionClient,
    businessId: string,
    sourceId: string,
    data: {
      title?: string;
      kind?: KnowledgeSourceKind;
      content?: string;
      contentHash?: string;
      status?: KnowledgeSourceStatus;
      chunkCount?: number;
      lastError?: string | null;
      embeddedAt?: Date | null;
    },
  ) {
    return transaction.knowledgeSource.update({
      where: { id: sourceId, businessId },
      data,
      select: knowledgeSourceSelect,
    });
  }

  public async deleteSource(businessId: string, sourceId: string): Promise<boolean> {
    const result = await prisma.knowledgeSource.deleteMany({ where: { id: sourceId, businessId } });

    return result.count === 1;
  }

  /** Replaces a source's passages; embeddings are filled in later by the worker. */
  public async replaceChunks(
    transaction: TransactionClient,
    businessId: string,
    sourceId: string,
    chunks: KnowledgeTextChunk[],
  ): Promise<void> {
    await transaction.knowledgeChunk.deleteMany({ where: { businessId, sourceId } });
    await transaction.knowledgeChunk.createMany({
      data: chunks.map((chunk) => ({ id: randomUUID(), businessId, sourceId, ...chunk })),
    });
  }

  /** Asks the worker to (re-)embed a source once this transaction commits. */
  public async recordSourceChanged(
    transaction: TransactionClient,
    businessId: string,
    sourceId: string,
    contentHash: string,
  ): Promise<void> {
    await transaction.outboxEvent.create({
      data: {
        id: randomUUID(),
        businessId,
        type: KNOWLEDGE_CONSTANTS.SOURCE_CHANGED_EVENT,
        aggregateType: KNOWLEDGE_CONSTANTS.AGGREGATE_TYPE,
        aggregateId: sourceId,
        payload: { sourceId, businessId, contentHash },
      },
    });
  }

  public listUnembeddedChunks(businessId: string, sourceId: string) {
    return prisma.$queryRaw<Array<{ id: string; content: string }>>`
      SELECT "id", "content" FROM "knowledge_chunks"
      WHERE "business_id" = ${businessId}::uuid AND "source_id" = ${sourceId}::uuid AND "embedding" IS NULL
      ORDER BY "position"
    `;
  }

  public async saveEmbedding(businessId: string, chunkId: string, vector: number[]): Promise<void> {
    await prisma.$executeRaw`
      UPDATE "knowledge_chunks" SET "embedding" = ${toVectorLiteral(vector)}::vector
      WHERE "id" = ${chunkId}::uuid AND "business_id" = ${businessId}::uuid
    `;
  }

  /** Nearest passages by cosine similarity to the query embedding. */
  public searchByVector(businessId: string, vector: number[], limit: number): Promise<KnowledgeCandidate[]> {
    const literal = toVectorLiteral(vector);

    return prisma.$queryRaw<KnowledgeCandidate[]>`
      SELECT c."id" AS "chunkId", c."source_id" AS "sourceId", s."title" AS "sourceTitle", s."kind",
             c."content", (1 - (c."embedding" <=> ${literal}::vector))::float8 AS "score"
      FROM "knowledge_chunks" c
      JOIN "knowledge_sources" s ON s."id" = c."source_id"
      WHERE c."business_id" = ${businessId}::uuid AND c."embedding" IS NOT NULL
      ORDER BY c."embedding" <=> ${literal}::vector
      LIMIT ${limit}
    `;
  }

  /** Passages sharing any word with the query, ranked by coverage. */
  public searchByKeywords(businessId: string, text: string, limit: number): Promise<KnowledgeCandidate[]> {
    return prisma.$queryRaw<KnowledgeCandidate[]>`
      WITH q AS (
        SELECT NULLIF(replace(plainto_tsquery('english', ${text})::text, '&', '|'), '')::tsquery AS query
      )
      SELECT c."id" AS "chunkId", c."source_id" AS "sourceId", s."title" AS "sourceTitle", s."kind",
             c."content", ts_rank_cd(to_tsvector('english', c."content"), q.query)::float8 AS "score"
      FROM "knowledge_chunks" c
      JOIN "knowledge_sources" s ON s."id" = c."source_id"
      CROSS JOIN q
      WHERE c."business_id" = ${businessId}::uuid
        AND q.query IS NOT NULL
        AND to_tsvector('english', c."content") @@ q.query
      ORDER BY "score" DESC
      LIMIT ${limit}
    `;
  }

  public async markEmbedded(businessId: string, sourceId: string, contentHash: string, at: Date): Promise<void> {
    await prisma.knowledgeSource.updateMany({
      where: { id: sourceId, businessId, contentHash },
      data: { status: "READY", embeddedAt: at, lastError: null },
    });
  }

  public async markFailed(businessId: string, sourceId: string, contentHash: string, error: string): Promise<void> {
    await prisma.knowledgeSource.updateMany({
      where: { id: sourceId, businessId, contentHash },
      data: { status: "FAILED", lastError: error.slice(0, 500) },
    });
  }
}

export const knowledgeDal = new KnowledgeDal();
