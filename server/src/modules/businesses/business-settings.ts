import { z } from "zod";

import {
  NOTIFICATION_CONSTANTS,
  VALIDATION_MESSAGES,
} from "../../constants/app.constants.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import type {
  BusinessSettings,
  UpdateBusinessSettingsRequest,
} from "./dto/business.dto.js";

/** Validators shared by business settings and per-service overrides. */
export const bookingPolicyFields = {
  bookingWindowDays: z.number().int().min(1).max(365),
  minimumNoticeMinutes: z.number().int().min(0).max(10_080),
  slotStepMinutes: z.number().int().min(5).max(120),
  cancellationWindowHours: z.number().int().min(0).max(720),
  rescheduleLimit: z.number().int().min(0).max(10),
  holdMinutes: z.number().int().min(2).max(60),
  noShowGraceMinutes: z.number().int().min(0).max(240),
  reminderOffsetsMinutes: z.array(z.number().int().min(5).max(20_160)).max(5),
  allowGuestBooking: z.boolean(),
  autoConfirmBookings: z.boolean(),
  autoMarkNoShows: z.boolean(),
} as const;

const localTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const businessSettingsSchema = z.object({
  bookingWindowDays: bookingPolicyFields.bookingWindowDays.default(60),
  minimumNoticeMinutes: bookingPolicyFields.minimumNoticeMinutes.default(120),
  slotStepMinutes: bookingPolicyFields.slotStepMinutes.default(15),
  cancellationWindowHours: bookingPolicyFields.cancellationWindowHours.default(24),
  rescheduleLimit: bookingPolicyFields.rescheduleLimit.default(2),
  holdMinutes: bookingPolicyFields.holdMinutes.default(10),
  noShowGraceMinutes: bookingPolicyFields.noShowGraceMinutes.default(15),
  reminderOffsetsMinutes: bookingPolicyFields.reminderOffsetsMinutes.default([1_440, 120]),
  allowGuestBooking: bookingPolicyFields.allowGuestBooking.default(true),
  autoConfirmBookings: bookingPolicyFields.autoConfirmBookings.default(true),
  autoMarkNoShows: bookingPolicyFields.autoMarkNoShows.default(false),
  quietHoursStart: localTime.default(NOTIFICATION_CONSTANTS.DEFAULT_QUIET_HOURS_START),
  quietHoursEnd: localTime.default(NOTIFICATION_CONSTANTS.DEFAULT_QUIET_HOURS_END),
  noShowFee: z.enum(["payment", "deposit", "none"]).default("payment"),
});

export const DEFAULT_BUSINESS_SETTINGS = businessSettingsSchema.parse({});

export function parseStoredBusinessSettings(value: unknown): BusinessSettings {
  const stored =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? value
      : {};
  const parsed = businessSettingsSchema.safeParse(stored);

  // Stored settings are validated on write; if an older row predates a
  // constraint, fall back to defaults rather than failing every read.
  return parsed.success ? parsed.data : businessSettingsSchema.parse({});
}

export function mergeBusinessSettings(
  current: BusinessSettings,
  update: UpdateBusinessSettingsRequest,
): BusinessSettings {
  const parsed = businessSettingsSchema.safeParse({ ...current, ...update });

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.join(".") || "settings";
    throwRequestValidationError(field, VALIDATION_MESSAGES.BUSINESS_SETTINGS);
  }

  return parsed.data;
}
