-- CreateTable
CREATE TABLE "daily_metrics" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "metric" VARCHAR(80) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "computed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_metrics_business_id_date_metric_key" ON "daily_metrics"("business_id", "date", "metric");

-- AddForeignKey
ALTER TABLE "daily_metrics" ADD CONSTRAINT "daily_metrics_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

