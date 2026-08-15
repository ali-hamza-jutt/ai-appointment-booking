-- Add the abandoned lifecycle state while preserving existing enum values.
CREATE TYPE "chat_session_status_new" AS ENUM ('ACTIVE', 'CLOSED', 'ABANDONED');

ALTER TABLE "chat_sessions"
ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "status" TYPE "chat_session_status_new"
USING ("status"::text::"chat_session_status_new");

DROP TYPE "chat_session_status";
ALTER TYPE "chat_session_status_new" RENAME TO "chat_session_status";

ALTER TABLE "chat_sessions"
ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- Preserve only the most recently updated active chat for each user.
WITH ranked_active_sessions AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "user_id"
      ORDER BY "updated_at" DESC, "id" DESC
    ) AS "position"
  FROM "chat_sessions"
  WHERE "status" = 'ACTIVE'
)
UPDATE "chat_sessions"
SET "status" = 'ABANDONED'
WHERE "id" IN (
  SELECT "id"
  FROM ranked_active_sessions
  WHERE "position" > 1
);

-- Enforce the single-active-chat invariant under concurrent requests.
CREATE UNIQUE INDEX "chat_sessions_one_active_per_user_key"
ON "chat_sessions"("user_id")
WHERE "status" = 'ACTIVE';
