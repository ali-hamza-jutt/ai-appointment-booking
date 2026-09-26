-- Appointments become provider-side bookings.
ALTER TABLE "appointments" RENAME TO "bookings";
ALTER TABLE "bookings" RENAME CONSTRAINT "appointments_pkey" TO "bookings_pkey";
ALTER TABLE "bookings" RENAME CONSTRAINT "appointments_business_id_fkey" TO "bookings_business_id_fkey";
ALTER TABLE "bookings" RENAME CONSTRAINT "appointments_chat_session_id_fkey" TO "bookings_chat_session_id_fkey";
ALTER TABLE "bookings" RENAME CONSTRAINT "appointments_user_id_fkey" TO "bookings_user_id_fkey";

-- The per-user uniqueness guard is replaced by the provider exclusion constraint.
DROP INDEX IF EXISTS "appointments_user_id_scheduled_at_active_key";
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "appointments_duration_minutes_check";

ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'CONFIRMED';
ALTER TABLE "bookings" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_user_id_fkey";
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bookings"
    ADD COLUMN "customer_id" UUID,
    ADD COLUMN "service_id" UUID,
    ADD COLUMN "staff_id" UUID,
    ADD COLUMN "ends_at" TIMESTAMPTZ(3),
    ADD COLUMN "buffer_before_min" SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN "buffer_after_min" SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN "occupied_from" TIMESTAMPTZ(3),
    ADD COLUMN "occupied_until" TIMESTAMPTZ(3),
    ADD COLUMN "session_key" VARCHAR(120),
    ADD COLUMN "seats" SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN "price_minor" INTEGER,
    ADD COLUMN "currency" CHAR(3),
    ADD COLUMN "hold_expires_at" TIMESTAMPTZ(3),
    ADD COLUMN "reschedule_count" SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN "cancelled_by" "booking_actor_type",
    ADD COLUMN "cancel_reason" VARCHAR(500),
    ADD COLUMN "cancelled_at" TIMESTAMPTZ(3),
    ADD COLUMN "checked_in_at" TIMESTAMPTZ(3),
    ADD COLUMN "completed_at" TIMESTAMPTZ(3);

-- Earlier "pending" appointments were already reserved for the customer.
UPDATE "bookings" SET "status" = 'CONFIRMED' WHERE "status" = 'PENDING';

UPDATE "bookings"
SET
    "ends_at" = "scheduled_at" + "duration_minutes" * INTERVAL '1 minute',
    "occupied_from" = "scheduled_at",
    "occupied_until" = "scheduled_at" + "duration_minutes" * INTERVAL '1 minute',
    "session_key" = "id"::text;

-- Every booking belongs to a customer of its business.
INSERT INTO "customers" ("id", "business_id", "user_id", "name", "email", "updated_at")
SELECT gen_random_uuid(), "missing"."business_id", "users"."id", "users"."full_name", "users"."email", CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "bookings"."business_id", "bookings"."user_id"
    FROM "bookings"
    WHERE "bookings"."user_id" IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM "customers"
          WHERE "customers"."business_id" = "bookings"."business_id"
            AND "customers"."user_id" = "bookings"."user_id"
      )
) AS "missing"
JOIN "users" ON "users"."id" = "missing"."user_id"
ON CONFLICT DO NOTHING;

UPDATE "bookings"
SET "customer_id" = "customers"."id"
FROM "customers"
WHERE "customers"."business_id" = "bookings"."business_id"
  AND "customers"."user_id" = "bookings"."user_id";

ALTER TABLE "bookings"
    ALTER COLUMN "customer_id" SET NOT NULL,
    ALTER COLUMN "ends_at" SET NOT NULL,
    ALTER COLUMN "occupied_from" SET NOT NULL,
    ALTER COLUMN "occupied_until" SET NOT NULL,
    ALTER COLUMN "session_key" SET NOT NULL;

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "bookings_staff_id_status_occupied_from_idx" ON "bookings"("staff_id", "status", "occupied_from");
CREATE INDEX "bookings_status_hold_expires_at_idx" ON "bookings"("status", "hold_expires_at");
CREATE INDEX "bookings_customer_id_scheduled_at_idx" ON "bookings"("customer_id", "scheduled_at");

ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_duration_minutes_check" CHECK ("duration_minutes" BETWEEN 5 AND 720),
    ADD CONSTRAINT "bookings_time_range_check" CHECK ("ends_at" > "scheduled_at" AND "occupied_from" <= "scheduled_at" AND "occupied_until" >= "ends_at"),
    ADD CONSTRAINT "bookings_seats_check" CHECK ("seats" >= 1),
    ADD CONSTRAINT "bookings_hold_check" CHECK ("status" <> 'HELD' OR "hold_expires_at" IS NOT NULL);

-- Final guard against double booking a provider. Bookings that share a
-- session key (seats in one class) may overlap; anything else may not.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_provider_overlap"
    EXCLUDE USING gist (
        "staff_id" WITH =,
        tstzrange("occupied_from", "occupied_until") WITH &&,
        "session_key" WITH <>
    )
    WHERE ("staff_id" IS NOT NULL AND "status" IN ('HELD', 'PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'CHECKED_IN'));

-- Chat sessions book with one business.
ALTER TABLE "chat_sessions" ADD COLUMN "business_id" UUID;
UPDATE "chat_sessions" SET "business_id" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "chat_sessions" ALTER COLUMN "business_id" SET NOT NULL;
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-service overrides of booking policies.
ALTER TABLE "services" ADD COLUMN "policy_overrides" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "booking_events" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "from_status" "booking_status",
    "to_status" "booking_status",
    "actor_type" "booking_actor_type" NOT NULL,
    "actor_user_id" UUID,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_events_booking_id_created_at_idx" ON "booking_events"("booking_id", "created_at");
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "business_id" UUID,
    "type" VARCHAR(80) NOT NULL,
    "aggregate_type" VARCHAR(40) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "outbox_events_published_at_created_at_idx" ON "outbox_events"("published_at", "created_at");
