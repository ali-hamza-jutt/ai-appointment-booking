import { getLocalDateTimeValues } from "../../utils/time-zone.js";
import { partOfDayOf } from "../customers/preference-derivation.js";

export interface WaitlistWindow {
  /** YYYY-MM-DD, inclusive, in the entry's time zone. */
  fromDate: string;
  toDate: string;
  partOfDay: string | null;
  timeZone: string;
  staffId: string | null;
}

/**
 * Whether a freed time suits a waiting customer: on one of their dates and
 * in their part of the day (both in their own time zone), and with their
 * provider when they asked for one.
 */
export function suitsWaitlistEntry(
  entry: WaitlistWindow,
  freed: { startsAt: Date; staffId: string | null },
): boolean {
  if (entry.staffId && entry.staffId !== freed.staffId) return false;

  const local = getLocalDateTimeValues(freed.startsAt, entry.timeZone);

  if (!local || local.date < entry.fromDate || local.date > entry.toDate) return false;

  return !entry.partOfDay || partOfDayOf({ scheduledAt: freed.startsAt, timeZone: entry.timeZone }) === entry.partOfDay;
}
