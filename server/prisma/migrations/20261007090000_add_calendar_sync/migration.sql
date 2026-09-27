-- Staff calendar sync: OAuth connections to Google or Microsoft 365, busy
-- times imported from those calendars, and the event written for each booking.

-- CreateEnum
CREATE TYPE "calendar_provider" AS ENUM ('GOOGLE', 'MICROSOFT');

-- CreateEnum
CREATE TYPE "calendar_connection_status" AS ENUM ('ACTIVE', 'NEEDS_RECONNECT');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "calendar_connection_id" UUID,
ADD COLUMN     "calendar_event_id" VARCHAR(1024);

-- CreateTable
CREATE TABLE "calendar_connections" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "provider" "calendar_provider" NOT NULL,
    "status" "calendar_connection_status" NOT NULL DEFAULT 'ACTIVE',
    "account_email" VARCHAR(254) NOT NULL,
    "refresh_token_encrypted" TEXT NOT NULL,
    "access_token_encrypted" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(3),
    "channel_id" VARCHAR(200),
    "channel_resource_id" VARCHAR(200),
    "channel_token_hash" CHAR(64),
    "channel_expires_at" TIMESTAMPTZ(3),
    "busy_hash" CHAR(64),
    "last_synced_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_busy" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_busy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_connections_staff_id_key" ON "calendar_connections"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_connections_channel_id_key" ON "calendar_connections"("channel_id");

-- CreateIndex
CREATE INDEX "calendar_connections_business_id_idx" ON "calendar_connections"("business_id");

-- CreateIndex
CREATE INDEX "external_busy_staff_id_starts_at_idx" ON "external_busy"("staff_id", "starts_at");

-- CreateIndex
CREATE INDEX "external_busy_connection_id_idx" ON "external_busy"("connection_id");

-- AddForeignKey
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_busy" ADD CONSTRAINT "external_busy_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_busy" ADD CONSTRAINT "external_busy_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_busy" ADD CONSTRAINT "external_busy_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "calendar_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_calendar_connection_id_fkey" FOREIGN KEY ("calendar_connection_id") REFERENCES "calendar_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

