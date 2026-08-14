-- CreateEnum
CREATE TYPE "appointment_status" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "appointment_source" AS ENUM ('FORM', 'CHAT');

-- CreateEnum
CREATE TYPE "chat_session_status" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "chat_message_role" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "service_name" VARCHAR(120) NOT NULL,
    "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
    "duration_minutes" SMALLINT NOT NULL DEFAULT 30,
    "status" "appointment_status" NOT NULL DEFAULT 'PENDING',
    "source" "appointment_source" NOT NULL DEFAULT 'FORM',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "appointments_duration_minutes_check" CHECK ("duration_minutes" BETWEEN 5 AND 480)
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(120),
    "status" "chat_session_status" NOT NULL DEFAULT 'ACTIVE',
    "booking_context" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "client_message_id" UUID,
    "role" "chat_message_role" NOT NULL,
    "content" TEXT NOT NULL,
    "structured_data" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "appointments_user_id_scheduled_at_key" ON "appointments"("user_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "appointments_user_id_status_scheduled_at_idx" ON "appointments"("user_id", "status", "scheduled_at");

-- CreateIndex
CREATE INDEX "chat_sessions_user_id_updated_at_id_idx" ON "chat_sessions"("user_id", "updated_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_session_id_client_message_id_key" ON "chat_messages"("session_id", "client_message_id");

-- CreateIndex
CREATE INDEX "chat_messages_session_id_created_at_id_idx" ON "chat_messages"("session_id", "created_at", "id");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
