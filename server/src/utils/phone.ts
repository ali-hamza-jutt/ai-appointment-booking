import { AUTH_CONSTANTS } from "../constants/app.constants.js";

/**
 * A phone number as E.164 (+447700900123) with formatting stripped, or null
 * when it isn't one; a number without a country code is never guessed at.
 */
export function toE164(value: string | null | undefined): string | null {
  const compact = value?.replace(/[\s().-]/g, "") ?? "";

  return AUTH_CONSTANTS.E164_PHONE_PATTERN.test(compact) ? compact : null;
}
