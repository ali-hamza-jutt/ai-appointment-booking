-- CreateEnum
CREATE TYPE "chat_channel" AS ENUM ('WEB', 'WIDGET', 'WHATSAPP', 'SMS');

-- AlterTable
ALTER TABLE "chat_sessions" ADD COLUMN     "business_address" VARCHAR(40),
ADD COLUMN     "channel" "chat_channel" NOT NULL DEFAULT 'WEB',
ADD COLUMN     "customer_address" VARCHAR(40);

-- CreateTable
CREATE TABLE "messaging_numbers" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "channel" "chat_channel" NOT NULL,
    "address" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messaging_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "messaging_numbers_address_key" ON "messaging_numbers"("address");

-- CreateIndex
CREATE INDEX "messaging_numbers_business_id_idx" ON "messaging_numbers"("business_id");

-- AddForeignKey
ALTER TABLE "messaging_numbers" ADD CONSTRAINT "messaging_numbers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- People who only text or WhatsApp the business sign in with SMS codes to
-- their verified number, so that counts as a sign-in method too.
ALTER TABLE "users" DROP CONSTRAINT "users_sign_in_method_check";
ALTER TABLE "users" ADD CONSTRAINT "users_sign_in_method_check"
  CHECK ("password_hash" IS NOT NULL OR "google_subject" IS NOT NULL OR "email_verified_at" IS NOT NULL OR "phone_verified_at" IS NOT NULL);
