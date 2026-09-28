-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "suspended_at" TIMESTAMPTZ(3),
ADD COLUMN     "suspended_reason" VARCHAR(500);

-- CreateTable
CREATE TABLE "llm_usage" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" BIGINT NOT NULL DEFAULT 0,
    "output_tokens" BIGINT NOT NULL DEFAULT 0,
    "cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "llm_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "target_type" VARCHAR(30) NOT NULL,
    "target_id" VARCHAR(120),
    "details" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "llm_usage_business_id_date_model_key" ON "llm_usage"("business_id", "date", "model");

-- CreateIndex
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_target_type_target_id_idx" ON "admin_audit_logs"("target_type", "target_id");

-- AddForeignKey
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

