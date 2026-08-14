-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "chat_session_id" UUID;

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN "reply_to_message_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "appointments_chat_session_id_key" ON "appointments"("chat_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_session_id_reply_to_message_id_key" ON "chat_messages"("session_id", "reply_to_message_id");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "chat_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
