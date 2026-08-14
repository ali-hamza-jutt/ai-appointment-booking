-- Development/demo data only. Do not run this file against a production database.
-- Sample account: demo@bookwise.local / BookWise123

BEGIN;

INSERT INTO "users" (
  "id",
  "email",
  "password_hash",
  "full_name",
  "created_at",
  "updated_at"
)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'demo@bookwise.local',
  '$argon2id$v=19$m=19456,p=1,t=2$XAIEQ3K9vWKseQN2ubDNBQ$MGGRNMKF+AMpqLAF1/GqqlnAsHUQRL++8cyTGk7GtsE',
  'BookWise Demo User',
  '2026-08-15 09:00:00+00',
  '2026-08-15 09:00:00+00'
)
ON CONFLICT DO NOTHING;

INSERT INTO "chat_sessions" (
  "id",
  "user_id",
  "title",
  "status",
  "booking_context",
  "created_at",
  "updated_at"
)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'Product discovery consultation',
  'CLOSED',
  '{"serviceName":"Product discovery consultation","scheduledAt":"2027-01-15T10:00:00.000Z","durationMinutes":60,"notes":"Discuss product scope and delivery milestones."}'::jsonb,
  '2026-08-15 09:05:00+00',
  '2026-08-15 09:10:00+00'
)
ON CONFLICT DO NOTHING;

INSERT INTO "appointments" (
  "id",
  "user_id",
  "chat_session_id",
  "service_name",
  "scheduled_at",
  "duration_minutes",
  "status",
  "source",
  "notes",
  "created_at",
  "updated_at"
)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'Product discovery consultation',
  '2027-01-15 10:00:00+00',
  60,
  'CONFIRMED',
  'CHAT',
  'Discuss product scope and delivery milestones.',
  '2026-08-15 09:10:00+00',
  '2026-08-15 09:10:00+00'
)
ON CONFLICT DO NOTHING;

INSERT INTO "chat_messages" (
  "id",
  "session_id",
  "client_message_id",
  "reply_to_message_id",
  "role",
  "content",
  "structured_data",
  "created_at"
)
VALUES
  (
    '44444444-4444-4444-8444-444444444444',
    '22222222-2222-4222-8222-222222222222',
    '66666666-6666-4666-8666-666666666666',
    NULL,
    'USER',
    'Book a 60-minute product discovery consultation for January 15, 2027 at 10:00 AM UTC.',
    NULL,
    '2026-08-15 09:05:00+00'
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    '22222222-2222-4222-8222-222222222222',
    NULL,
    '44444444-4444-4444-8444-444444444444',
    'ASSISTANT',
    'Your appointment has been booked for the product discovery consultation.',
    '{"intent":"BOOK_APPOINTMENT","bookingContext":{"serviceName":"Product discovery consultation","scheduledAt":"2027-01-15T10:00:00.000Z","durationMinutes":60,"notes":"Discuss product scope and delivery milestones."},"missingFields":[],"confirmationRequired":false,"appointmentId":"33333333-3333-4333-8333-333333333333"}'::jsonb,
    '2026-08-15 09:10:00+00'
  )
ON CONFLICT DO NOTHING;

COMMIT;
