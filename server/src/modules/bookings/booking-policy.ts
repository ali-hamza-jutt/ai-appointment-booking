import { z } from "zod";

import {
  bookingPolicyFields,
  parseStoredBusinessSettings,
} from "../businesses/business-settings.js";
import type { BusinessSettings } from "../businesses/dto/business.dto.js";

/** Policies a single service may override. Absent keys fall back to the business. */
export const servicePolicyOverridesSchema = z
  .object({
    minimumNoticeMinutes: bookingPolicyFields.minimumNoticeMinutes.optional(),
    bookingWindowDays: bookingPolicyFields.bookingWindowDays.optional(),
    cancellationWindowHours: bookingPolicyFields.cancellationWindowHours.optional(),
    rescheduleLimit: bookingPolicyFields.rescheduleLimit.optional(),
  })
  .strict();

type OverrideKey = keyof z.infer<typeof servicePolicyOverridesSchema>;

/** Overrides with absent keys omitted rather than set to undefined. */
export type ServicePolicyOverrides = { [Key in OverrideKey]?: number };

export function compactPolicyOverrides(
  overrides: z.infer<typeof servicePolicyOverridesSchema>,
): ServicePolicyOverrides {
  return Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  ) as ServicePolicyOverrides;
}

export function parseServicePolicyOverrides(value: unknown): ServicePolicyOverrides {
  const parsed = servicePolicyOverridesSchema.safeParse(value ?? {});

  return parsed.success ? compactPolicyOverrides(parsed.data) : {};
}

/** Business settings with the service's overrides applied. */
export function resolveBookingPolicy(
  businessSettings: unknown,
  serviceOverrides: unknown,
): BusinessSettings {
  return {
    ...parseStoredBusinessSettings(businessSettings),
    ...parseServicePolicyOverrides(serviceOverrides),
  };
}
