-- Business knowledge (FAQs, policies, prep notes) the booking agent can quote.
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "knowledge_source_kind" AS ENUM ('FAQ', 'POLICY', 'PREPARATION', 'OTHER');

-- CreateEnum
CREATE TYPE "knowledge_source_status" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "knowledge_sources" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "kind" "knowledge_source_kind" NOT NULL DEFAULT 'FAQ',
    "content" TEXT NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "status" "knowledge_source_status" NOT NULL DEFAULT 'PENDING',
    "last_error" VARCHAR(500),
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "embedded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "knowledge_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL,
    "embedding" vector(1024),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_sources_business_id_updated_at_idx" ON "knowledge_sources"("business_id", "updated_at");

-- CreateIndex
CREATE INDEX "knowledge_chunks_business_id_idx" ON "knowledge_chunks"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_chunks_source_id_position_key" ON "knowledge_chunks"("source_id", "position");

-- AddForeignKey
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "knowledge_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Keyword search, used alongside (or without) embeddings.
CREATE INDEX "knowledge_chunks_content_fts_idx"
  ON "knowledge_chunks" USING gin (to_tsvector('english', "content"));

-- Approximate nearest-neighbour search over embeddings (cosine distance).
CREATE INDEX "knowledge_chunks_embedding_idx"
  ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);
