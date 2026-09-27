-- Online payments: each business connects a Stripe account, services can ask
-- for a deposit or full prepayment, and every Checkout payment is recorded.

-- CreateEnum
CREATE TYPE "service_payment_mode" AS ENUM ('NONE', 'DEPOSIT', 'FULL');

-- CreateEnum
CREATE TYPE "payment_kind" AS ENUM ('DEPOSIT', 'FULL');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "payment_mode" "service_payment_mode" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "payment_accounts" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "stripe_account_id" VARCHAR(100) NOT NULL,
    "charges_enabled" BOOLEAN NOT NULL DEFAULT false,
    "payouts_enabled" BOOLEAN NOT NULL DEFAULT false,
    "details_submitted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "kind" "payment_kind" NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'PENDING',
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "refunded_minor" INTEGER NOT NULL DEFAULT 0,
    "stripe_account_id" VARCHAR(100) NOT NULL,
    "checkout_session_id" VARCHAR(255) NOT NULL,
    "checkout_url" TEXT,
    "checkout_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "payment_intent_id" VARCHAR(255),
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" VARCHAR(255) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_accounts_business_id_key" ON "payment_accounts"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_accounts_stripe_account_id_key" ON "payment_accounts"("stripe_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_checkout_session_id_key" ON "payments"("checkout_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_payment_intent_id_key" ON "payments"("payment_intent_id");

-- CreateIndex
CREATE INDEX "payments_booking_id_created_at_idx" ON "payments"("booking_id", "created_at");

-- AddForeignKey
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Services that already had a deposit set now ask for it online. Nothing is
-- charged until the business connects a Stripe account.
UPDATE "services" SET "payment_mode" = 'DEPOSIT' WHERE "deposit_minor" > 0;
