import { AI_CONSTANTS } from "../constants/app.constants.js";

export function normalizeIanaTimeZone(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const timeZone = value.trim();

  if (!timeZone || timeZone.length > AI_CONSTANTS.MAX_TIME_ZONE_LENGTH) {
    return null;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return timeZone;
  } catch (_error) {
    return null;
  }
}
