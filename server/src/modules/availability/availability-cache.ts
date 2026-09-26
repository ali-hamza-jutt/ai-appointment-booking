import { env } from "../../config/env.js";
import { VersionedCache } from "../../infrastructure/redis/versioned-cache.js";
import type { AvailabilityResponse } from "./dto/availability.dto.js";

const DATE_FIELDS = new Set(["startsAt", "endsAt"]);

/**
 * Public availability per business, dropped whenever that business's
 * bookings or schedule change. Slots are always rechecked when held, so a
 * stale entry can only offer a time that then fails cleanly.
 */
export const availabilityCache = new VersionedCache<AvailabilityResponse>({
  namespace: "availability",
  ttlSeconds: env.AVAILABILITY_CACHE_TTL_SECONDS,
  reviver: (key, value) =>
    DATE_FIELDS.has(key) && typeof value === "string" ? new Date(value) : value,
});
