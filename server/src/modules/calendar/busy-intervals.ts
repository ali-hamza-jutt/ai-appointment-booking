import { createHash } from "node:crypto";

import type { BusyInterval } from "../../integrations/calendar/calendar.dto.js";

/**
 * Busy times clipped to the range, sorted, with overlapping or touching
 * ones joined, so the same calendar always gives the same list.
 */
export function mergeBusyIntervals(intervals: BusyInterval[], range: { from: Date; to: Date }): BusyInterval[] {
  const clipped = intervals
    .map((interval) => ({
      startsAt: new Date(Math.max(interval.startsAt.getTime(), range.from.getTime())),
      endsAt: new Date(Math.min(interval.endsAt.getTime(), range.to.getTime())),
    }))
    .filter((interval) => interval.endsAt > interval.startsAt)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const merged: BusyInterval[] = [];

  for (const interval of clipped) {
    const last = merged.at(-1);

    if (last && interval.startsAt <= last.endsAt) {
      if (interval.endsAt > last.endsAt) last.endsAt = interval.endsAt;
    } else {
      merged.push({ ...interval });
    }
  }

  return merged;
}

/** A fingerprint of merged busy times; equal lists give equal fingerprints. */
export function busyFingerprint(intervals: BusyInterval[]): string {
  return createHash("sha256")
    .update(intervals.map((interval) => `${interval.startsAt.toISOString()}/${interval.endsAt.toISOString()}`).join(","))
    .digest("hex");
}
