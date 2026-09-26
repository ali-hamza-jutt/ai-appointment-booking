import { z } from "zod";

import {
  VALIDATION_MESSAGES,
} from "../../constants/app.constants.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import type {
  BusinessSettings,
  UpdateBusinessSettingsRequest,
} from "./dto/business.dto.js";

export const businessSettingsSchema = z.object({
  bookingWindowDays: z.number().int().min(1).max(365).default(60),
  minimumNoticeMinutes: z.number().int().min(0).max(10_080).default(120),
  slotStepMinutes: z.number().int().min(5).max(120).default(15),
  cancellationWindowHours: z.number().int().min(0).max(720).default(24),
  rescheduleLimit: z.number().int().min(0).max(10).default(2),
  holdMinutes: z.number().int().min(2).max(60).default(10),
  noShowGraceMinutes: z.number().int().min(0).max(240).default(15),
  reminderOffsetsMinutes: z
    .array(z.number().int().min(5).max(20_160))
    .max(5)
    .default([1_440, 120]),
  allowGuestBooking: z.boolean().default(true),
  autoConfirmBookings: z.boolean().default(true),
});

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
