import {
  AGENT_CONSTANTS,
  CUSTOMER_PROFILE_CONSTANTS,
} from "../../constants/app.constants.js";
import { getLocalDateTimeValues, localTimeToMinutes } from "../../utils/time-zone.js";
import type {
  CustomerHistoryVisit,
  CustomerPreferenceKey,
  PartOfDay,
} from "./dto/customer-profile.dto.js";

export type DerivedPreferences = Partial<Record<CustomerPreferenceKey, string>>;

/** The part of day a visit started in, in the time zone it was booked in. */
export function partOfDayOf(visit: Pick<CustomerHistoryVisit, "scheduledAt" | "timeZone">): PartOfDay | null {
  const minute = localTimeToMinutes(getLocalDateTimeValues(visit.scheduledAt, visit.timeZone)?.time ?? "");

  if (minute === null) return null;

  for (const part of CUSTOMER_PROFILE_CONSTANTS.PARTS_OF_DAY) {
    const window = AGENT_CONSTANTS.PART_OF_DAY[part];

    if (minute >= window.fromMinute && minute < window.toMinute) return part;
  }

  return null;
}

/**
 * The value seen most often, if it was seen at least minRepeats times.
 * Values arrive newest first, so a tie goes to the most recent.
 */
function mostFrequent(values: Array<string | null>, minRepeats: number): string | undefined {
  const counts = new Map<string, number>();

  for (const value of values) {
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let best: string | undefined;
  let bestCount = 0;

  for (const value of values) {
    const count = value ? (counts.get(value) ?? 0) : 0;

    if (value && count > bestCount) {
      best = value;
      bestCount = count;
    }
  }

  return bestCount >= minRepeats ? best : undefined;
}

/**
 * Preferences that follow from completed visits (newest first): the usual
 * service, the usual provider and the usual part of day, each only once
 * it has repeated.
 */
export function derivePreferences(
  visits: CustomerHistoryVisit[],
  minRepeats: number = CUSTOMER_PROFILE_CONSTANTS.MIN_REPEATS,
): DerivedPreferences {
  const derived: DerivedPreferences = {};
  const service = mostFrequent(visits.map((visit) => visit.serviceId), minRepeats);
  const staff = mostFrequent(visits.map((visit) => visit.staffId), minRepeats);
  const partOfDay = mostFrequent(visits.map((visit) => partOfDayOf(visit)), minRepeats);

  if (service) derived.USUAL_SERVICE = service;
  if (staff) derived.PREFERRED_STAFF = staff;
  if (partOfDay) derived.PREFERRED_PART_OF_DAY = partOfDay;

  return derived;
}
