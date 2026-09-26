-- New enum values must be committed before any statement can use them, so
-- they live in their own migration.
ALTER TYPE "appointment_status" RENAME TO "booking_status";
ALTER TYPE "booking_status" ADD VALUE IF NOT EXISTS 'HELD' BEFORE 'PENDING';
ALTER TYPE "booking_status" ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT' BEFORE 'PENDING';
ALTER TYPE "booking_status" ADD VALUE IF NOT EXISTS 'CHECKED_IN' AFTER 'CONFIRMED';
ALTER TYPE "booking_status" ADD VALUE IF NOT EXISTS 'NO_SHOW' AFTER 'CANCELLED';
ALTER TYPE "booking_status" ADD VALUE IF NOT EXISTS 'EXPIRED' AFTER 'NO_SHOW';

ALTER TYPE "appointment_source" RENAME TO "booking_source";
ALTER TYPE "booking_source" ADD VALUE IF NOT EXISTS 'STAFF';

CREATE TYPE "booking_actor_type" AS ENUM ('CUSTOMER', 'STAFF', 'SYSTEM');
