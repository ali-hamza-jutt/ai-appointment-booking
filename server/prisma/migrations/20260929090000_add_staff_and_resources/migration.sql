-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "user_id" UUID,
    "display_name" VARCHAR(80) NOT NULL,
    "email" VARCHAR(254),
    "bio" VARCHAR(1000),
    "avatar_url" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_providers" (
    "service_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "custom_duration_minutes" SMALLINT,
    "custom_price_minor" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_providers_pkey" PRIMARY KEY ("service_id","staff_id")
);

-- CreateTable
CREATE TABLE "staff_locations" (
    "staff_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,

    CONSTRAINT "staff_locations_pkey" PRIMARY KEY ("staff_id","location_id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "capacity" SMALLINT NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_resources" (
    "service_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,

    CONSTRAINT "service_resources_pkey" PRIMARY KEY ("service_id","resource_id")
);

-- CreateIndex
CREATE INDEX "staff_business_id_is_active_sort_order_idx" ON "staff"("business_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "staff_business_id_user_id_key" ON "staff"("business_id", "user_id");

-- CreateIndex
CREATE INDEX "service_providers_staff_id_idx" ON "service_providers"("staff_id");

-- CreateIndex
CREATE INDEX "staff_locations_location_id_idx" ON "staff_locations"("location_id");

-- CreateIndex
CREATE INDEX "resources_business_id_is_active_idx" ON "resources"("business_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "resources_business_id_location_id_name_key" ON "resources"("business_id", "location_id", "name");

-- CreateIndex
CREATE INDEX "service_resources_resource_id_idx" ON "service_resources"("resource_id");

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_locations" ADD CONSTRAINT "staff_locations_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_locations" ADD CONSTRAINT "staff_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_resources" ADD CONSTRAINT "service_resources_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_resources" ADD CONSTRAINT "service_resources_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "service_providers"
    ADD CONSTRAINT "service_providers_custom_duration_check" CHECK ("custom_duration_minutes" IS NULL OR "custom_duration_minutes" BETWEEN 5 AND 720),
    ADD CONSTRAINT "service_providers_custom_price_check" CHECK ("custom_price_minor" IS NULL OR "custom_price_minor" >= 0);

ALTER TABLE "resources"
    ADD CONSTRAINT "resources_capacity_check" CHECK ("capacity" BETWEEN 1 AND 500);
