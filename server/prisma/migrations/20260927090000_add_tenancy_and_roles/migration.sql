-- CreateEnum
CREATE TYPE "platform_role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "membership_role" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "business_vertical" AS ENUM ('SALON', 'CLINIC', 'CONSULTANT', 'SPA_WELLNESS', 'FITNESS_STUDIO', 'TUTORING', 'PET_GROOMING');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "business_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "platform_role" "platform_role" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "businesses" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "vertical" "business_vertical" NOT NULL,
    "time_zone" VARCHAR(100) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "address" VARCHAR(300),
    "time_zone" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "role" "membership_role" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_invitations" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "role" "membership_role" NOT NULL,
    "invited_by_user_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "user_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(32),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

-- CreateIndex
CREATE INDEX "locations_business_id_created_at_idx" ON "locations"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "memberships_business_id_role_idx" ON "memberships"("business_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_business_id_key" ON "memberships"("user_id", "business_id");

-- CreateIndex
CREATE INDEX "business_invitations_email_idx" ON "business_invitations"("email");

-- CreateIndex
CREATE UNIQUE INDEX "business_invitations_business_id_email_key" ON "business_invitations"("business_id", "email");

-- CreateIndex
CREATE INDEX "customers_business_id_created_at_id_idx" ON "customers"("business_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_business_id_user_id_key" ON "customers"("business_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_business_id_email_key" ON "customers"("business_id", "email");

-- CreateIndex
CREATE INDEX "appointments_business_id_scheduled_at_idx" ON "appointments"("business_id", "scheduled_at");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_invitations" ADD CONSTRAINT "business_invitations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_invitations" ADD CONSTRAINT "business_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Seed the demo business that owns every appointment created before tenancy.
INSERT INTO "businesses" ("id", "slug", "name", "vertical", "time_zone", "currency", "settings", "updated_at")
VALUES (
    '00000000-0000-4000-8000-000000000001',
    'bookwise-demo',
    'BookWise Demo',
    'CONSULTANT',
    'UTC',
    'USD',
    '{}',
    CURRENT_TIMESTAMP
);

UPDATE "appointments"
SET "business_id" = '00000000-0000-4000-8000-000000000001'
WHERE "business_id" IS NULL;

ALTER TABLE "appointments" ALTER COLUMN "business_id" SET NOT NULL;

-- Every user who already booked becomes a customer of the demo business.
INSERT INTO "customers" ("id", "business_id", "user_id", "name", "email", "updated_at")
SELECT gen_random_uuid(), '00000000-0000-4000-8000-000000000001', "users"."id", "users"."full_name", "users"."email", CURRENT_TIMESTAMP
FROM "users"
WHERE EXISTS (
    SELECT 1 FROM "appointments" WHERE "appointments"."user_id" = "users"."id"
);
