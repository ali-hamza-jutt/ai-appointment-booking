-- Waitlist: customers wait for a service between two dates, and a freed
-- time is held for the first suitable one as a WAITLIST booking they confirm.

-- AlterEnum
ALTER TYPE "booking_source" ADD VALUE 'WAITLIST';

-- AlterEnum
ALTER TYPE "notification_kind" ADD VALUE 'WAITLIST_OFFER';

-- CreateEnum
CREATE TYPE "waitlist_status" AS ENUM ('WAITING', 'OFFERED', 'BOOKED', 'LEFT');

-- CreateEnum
CREATE TYPE "waitlist_offer_status" AS ENUM ('OPEN', 'ACCEPTED', 'LAPSED', 'DECLINED');

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "staff_id" UUID,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "part_of_day" VARCHAR(10),
    "time_zone" VARCHAR(100) NOT NULL,
    "status" "waitlist_status" NOT NULL DEFAULT 'WAITING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlist_offers" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "staff_id" UUID,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "waitlist_offer_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "waitlist_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "waitlist_entries_business_id_service_id_status_created_at_idx" ON "waitlist_entries"("business_id", "service_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "waitlist_entries_user_id_status_idx" ON "waitlist_entries"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_offers_booking_id_key" ON "waitlist_offers"("booking_id");

-- CreateIndex
CREATE INDEX "waitlist_offers_entry_id_idx" ON "waitlist_offers"("entry_id");

-- CreateIndex
CREATE INDEX "waitlist_offers_business_id_starts_at_idx" ON "waitlist_offers"("business_id", "starts_at");

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_offers" ADD CONSTRAINT "waitlist_offers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_offers" ADD CONSTRAINT "waitlist_offers_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "waitlist_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_offers" ADD CONSTRAINT "waitlist_offers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
