-- Booking notifications: per-business templates, a log of every message
-- sent (deduplicated per event and channel) and per-customer opt-outs.

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "notification_kind" AS ENUM ('BOOKING_CONFIRMED', 'BOOKING_REQUESTED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED', 'BOOKING_REMINDER');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "kind" "notification_kind" NOT NULL,
    "subject" VARCHAR(200),
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "booking_id" UUID,
    "customer_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "kind" "notification_kind" NOT NULL,
    "status" "notification_status" NOT NULL DEFAULT 'PENDING',
    "recipient" VARCHAR(254) NOT NULL,
    "dedupe_key" VARCHAR(200) NOT NULL,
    "provider_message_id" VARCHAR(100),
    "error" VARCHAR(500),
    "sent_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "opted_in" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_business_id_channel_kind_key" ON "notification_templates"("business_id", "channel", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_booking_id_created_at_idx" ON "notifications"("booking_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_provider_message_id_idx" ON "notifications"("provider_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_customer_id_channel_key" ON "notification_preferences"("customer_id", "channel");

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

