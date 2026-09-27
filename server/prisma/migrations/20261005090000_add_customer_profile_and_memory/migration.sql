-- What the booking agent remembers about a customer, plus a rolling
-- summary for long chats. One active chat is now allowed per business.

-- CreateEnum
CREATE TYPE "customer_preference_key" AS ENUM ('PREFERRED_STAFF', 'USUAL_SERVICE', 'PREFERRED_PART_OF_DAY');

-- CreateEnum
CREATE TYPE "customer_preference_source" AS ENUM ('CUSTOMER', 'BOOKING_HISTORY');

-- CreateTable
CREATE TABLE "customer_preferences" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "key" "customer_preference_key" NOT NULL,
    "value" VARCHAR(64) NOT NULL,
    "source" "customer_preference_source" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_preferences_customer_id_key_key" ON "customer_preferences"("customer_id", "key");

-- CreateIndex
CREATE INDEX "customer_preferences_business_id_idx" ON "customer_preferences"("business_id");

-- AddForeignKey
ALTER TABLE "customer_preferences" ADD CONSTRAINT "customer_preferences_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_preferences" ADD CONSTRAINT "customer_preferences_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "chat_sessions"
ADD COLUMN "summary" TEXT,
ADD COLUMN "summarized_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "summary_updated_at" TIMESTAMPTZ(3);

-- One active chat per customer per business, instead of one per user.
-- Existing rows already satisfy the stricter per-user rule.
DROP INDEX "chat_sessions_one_active_per_user_key";

CREATE UNIQUE INDEX "chat_sessions_one_active_per_user_business_key"
ON "chat_sessions"("user_id", "business_id")
WHERE "status" = 'ACTIVE';
