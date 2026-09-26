-- The chat's booking draft becomes typed references to real rows instead of
-- free-form JSON, and chats can be handed to staff.

ALTER TABLE "chat_sessions"
  ADD COLUMN "draft_service_id" UUID,
  ADD COLUMN "draft_staff_id" UUID,
  ADD COLUMN "draft_hold_id" UUID,
  ADD COLUMN "draft_time_zone" VARCHAR(100),
  ADD COLUMN "draft_notes" VARCHAR(2000),
  ADD COLUMN "handoff_requested_at" TIMESTAMPTZ(3),
  ADD COLUMN "handoff_reason" VARCHAR(500),
  ADD COLUMN "handoff_resolved_at" TIMESTAMPTZ(3);

-- Keep only references that still exist in the session's own business.
UPDATE "chat_sessions" cs
SET
  "draft_service_id" = s."id"
FROM "services" s
WHERE cs."booking_context" ->> 'serviceId' ~* '^[0-9a-f-]{36}$'
  AND s."id" = (cs."booking_context" ->> 'serviceId')::uuid
  AND s."business_id" = cs."business_id";

UPDATE "chat_sessions" cs
SET "draft_staff_id" = st."id"
FROM "staff" st
WHERE cs."booking_context" ->> 'staffId' ~* '^[0-9a-f-]{36}$'
  AND st."id" = (cs."booking_context" ->> 'staffId')::uuid
  AND st."business_id" = cs."business_id";

UPDATE "chat_sessions" cs
SET "draft_hold_id" = b."id"
FROM "bookings" b
WHERE cs."booking_context" ->> 'holdBookingId' ~* '^[0-9a-f-]{36}$'
  AND b."id" = (cs."booking_context" ->> 'holdBookingId')::uuid
  AND b."business_id" = cs."business_id";

UPDATE "chat_sessions"
SET
  "draft_time_zone" = LEFT("booking_context" ->> 'timeZone', 100),
  "draft_notes" = LEFT("booking_context" ->> 'notes', 2000)
WHERE "booking_context" IS NOT NULL;

ALTER TABLE "chat_sessions" DROP COLUMN "booking_context";

CREATE INDEX "chat_sessions_business_id_handoff_requested_at_idx"
  ON "chat_sessions"("business_id", "handoff_requested_at");

ALTER TABLE "chat_sessions"
  ADD CONSTRAINT "chat_sessions_draft_service_id_fkey" FOREIGN KEY ("draft_service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "chat_sessions_draft_staff_id_fkey" FOREIGN KEY ("draft_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "chat_sessions_draft_hold_id_fkey" FOREIGN KEY ("draft_hold_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
