-- Preserve the IANA time zone used when an appointment is created.
-- Existing rows use UTC because their original browser time zone was not stored.
ALTER TABLE "appointments"
ADD COLUMN "time_zone" VARCHAR(100) NOT NULL DEFAULT 'UTC';

-- Cancelled appointments no longer reserve their previous exact start time.
DROP INDEX "appointments_user_id_scheduled_at_key";

CREATE UNIQUE INDEX "appointments_user_id_scheduled_at_active_key"
ON "appointments"("user_id", "scheduled_at")
WHERE "status" <> 'CANCELLED';
