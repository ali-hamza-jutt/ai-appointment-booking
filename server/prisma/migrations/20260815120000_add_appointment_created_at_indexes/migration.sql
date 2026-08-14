CREATE INDEX "appointments_user_id_created_at_id_idx"
ON "appointments"("user_id", "created_at", "id");

CREATE INDEX "appointments_user_id_status_created_at_id_idx"
ON "appointments"("user_id", "status", "created_at", "id");
