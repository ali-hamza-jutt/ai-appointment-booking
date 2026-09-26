-- CreateEnum
CREATE TYPE "service_booking_type" AS ENUM ('APPOINTMENT', 'CLASS');

-- CreateTable
CREATE TABLE "service_categories" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "category_id" UUID,
    "location_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "booking_type" "service_booking_type" NOT NULL DEFAULT 'APPOINTMENT',
    "capacity" SMALLINT NOT NULL DEFAULT 1,
    "duration_minutes" SMALLINT NOT NULL,
    "price_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "deposit_minor" INTEGER,
    "buffer_before_min" SMALLINT NOT NULL DEFAULT 0,
    "buffer_after_min" SMALLINT NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "online_bookable" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_categories_business_id_sort_order_idx" ON "service_categories"("business_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_business_id_name_key" ON "service_categories"("business_id", "name");

-- CreateIndex
CREATE INDEX "services_business_id_is_active_sort_order_idx" ON "services"("business_id", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX "services_category_id_idx" ON "services"("category_id");

-- AddForeignKey
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Integrity rules the Prisma schema cannot express.
ALTER TABLE "services"
    ADD CONSTRAINT "services_capacity_check" CHECK ("capacity" >= 1 AND ("booking_type" = 'CLASS' OR "capacity" = 1)),
    ADD CONSTRAINT "services_duration_check" CHECK ("duration_minutes" BETWEEN 5 AND 720),
    ADD CONSTRAINT "services_price_check" CHECK ("price_minor" >= 0),
    ADD CONSTRAINT "services_deposit_check" CHECK ("deposit_minor" IS NULL OR ("deposit_minor" >= 0 AND "deposit_minor" <= "price_minor")),
    ADD CONSTRAINT "services_buffers_check" CHECK ("buffer_before_min" BETWEEN 0 AND 240 AND "buffer_after_min" BETWEEN 0 AND 240);

-- Trigram index so the booking agent can fuzzy-match "hair cut" to "Haircut – Men".
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "services_name_trgm_idx" ON "services" USING gin ("name" gin_trgm_ops);
