-- CreateTable
CREATE TABLE "guest_codes" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "business_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allowed_origins" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "origin" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allowed_origins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guest_codes_email_created_at_idx" ON "guest_codes"("email", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "allowed_origins_business_id_origin_key" ON "allowed_origins"("business_id", "origin");

-- AddForeignKey
ALTER TABLE "guest_codes" ADD CONSTRAINT "guest_codes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allowed_origins" ADD CONSTRAINT "allowed_origins_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Guests who booked with an emailed code have neither a password nor Google;
-- their verified email is how they sign in (another code, or a password reset).
ALTER TABLE "users" DROP CONSTRAINT "users_sign_in_method_check";
ALTER TABLE "users" ADD CONSTRAINT "users_sign_in_method_check"
  CHECK ("password_hash" IS NOT NULL OR "google_subject" IS NOT NULL OR "email_verified_at" IS NOT NULL);
