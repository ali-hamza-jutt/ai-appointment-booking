import {
  addDaysToLocalDate,
  getIsoWeekday,
  getLocalDateTimeValues,
  wallClockToUtc,
} from "../../utils/time-zone.js";

const MILLISECONDS_PER_MINUTE = 60_000;
const MILLISECONDS_PER_DAY = 86_400_000;

export interface TimeInterval {
  startsAt: Date;
  endsAt: Date;
}

export interface WeeklyRule {
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: number;
  startMinute: number;
  /** May exceed 1440 for a shift that ends after midnight. */
  endMinute: number;
  timeZone: string;
}

/** An existing class session of the queried service that still has seats. */
export interface ClassSession {
  startsAt: Date;
  endsAt: Date;
  /** Session interval widened by the service buffers. */
  blocked: TimeInterval;
  seatsTaken: number;
}

export interface ProviderSchedule {
  staffId: string;
  /** Service duration, or this provider's override. */
  durationMinutes: number;
  weeklyRules: WeeklyRule[];
  timeOff: TimeInterval[];
  /** Other bookings, already widened by their own buffers. */
  busy: TimeInterval[];
  classSessions: ClassSession[];
}

export interface ResourceSchedule {
  resourceId: string;
  capacity: number;
  busy: TimeInterval[];
}

export interface SlotGeneratorInput {
  from: Date;
  to: Date;
  now: Date;
  /** Local YYYY-MM-DD dates on which the business is closed. */
  closedDates: ReadonlySet<string>;
  service: {
    bookingType: "APPOINTMENT" | "CLASS";
    capacity: number;
    bufferBeforeMin: number;
    bufferAfterMin: number;
  };
  policy: {
    slotStepMinutes: number;
    minimumNoticeMinutes: number;
    bookingWindowDays: number;
  };
  providers: ProviderSchedule[];
  /** Resources the service requires; every one must have room. */
  resources: ResourceSchedule[];
}

export interface GeneratedSlot {
  startsAt: Date;
  endsAt: Date;
  staffIds: string[];
  /** Seats left for class services; null for appointments. */
  seatsLeft: number | null;
}

export interface AvailabilityWindow {
  start: number;
  end: number;
  /** Grid origin, so slots stay aligned to the shift start after gaps. */
  anchor: number;
}

/**
 * Pure slot generation: expands weekly rules into dated windows, removes
 * closures, time off and busy intervals, then walks each free window in
 * policy steps. "Any provider" is the union, keeping who owns each slot.
 */
export function generateSlots(input: SlotGeneratorInput): GeneratedSlot[] {
  const earliest = Math.max(
    input.from.getTime(),
    input.now.getTime() + input.policy.minimumNoticeMinutes * MILLISECONDS_PER_MINUTE,
  );
  const latest = Math.min(
    input.to.getTime(),
    input.now.getTime() + input.policy.bookingWindowDays * MILLISECONDS_PER_DAY,
  );

  if (earliest >= latest) return [];

  const slots = new Map<string, GeneratedSlot>();
  const stepMs = input.policy.slotStepMinutes * MILLISECONDS_PER_MINUTE;
  const beforeMs = input.service.bufferBeforeMin * MILLISECONDS_PER_MINUTE;
  const afterMs = input.service.bufferAfterMin * MILLISECONDS_PER_MINUTE;
  const isClass = input.service.bookingType === "CLASS";

  for (const provider of input.providers) {
    const durationMs = provider.durationMinutes * MILLISECONDS_PER_MINUTE;
    const windows = expandWeeklyRules(
      provider.weeklyRules,
      earliest - beforeMs,
      latest + durationMs + afterMs,
      input.closedDates,
    );
    const blocked = [
      ...provider.timeOff,
      ...provider.busy,
      ...provider.classSessions.map((session) => session.blocked),
    ].map(toMilliseconds);
    const freeWindows = subtractIntervals(windows, blocked);

    for (const window of freeWindows) {
      const firstStart = Math.max(window.start + beforeMs, earliest);
      let start =
        window.anchor + Math.ceil((firstStart - window.anchor) / stepMs) * stepMs;

      for (; start < latest && start + durationMs + afterMs <= window.end; start += stepMs) {
        const occupied = { start: start - beforeMs, end: start + durationMs + afterMs };

        if (!resourcesHaveRoom(input.resources, occupied)) continue;

        addSlot(slots, {
          startsAt: new Date(start),
          endsAt: new Date(start + durationMs),
          staffIds: [provider.staffId],
          seatsLeft: isClass ? input.service.capacity : null,
        });
      }
    }

    if (!isClass) continue;

    const unavailable = [...provider.timeOff, ...provider.busy].map(toMilliseconds);

    for (const session of provider.classSessions) {
      const start = session.startsAt.getTime();
      const seatsLeft = input.service.capacity - session.seatsTaken;
      const blockedSession = toMilliseconds(session.blocked);

      if (
        seatsLeft > 0 &&
        start >= earliest &&
        start < latest &&
        !unavailable.some((interval) => overlaps(interval, blockedSession))
      ) {
        addSlot(slots, {
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          staffIds: [provider.staffId],
          seatsLeft,
        });
      }
    }
  }

  return [...slots.values()].sort(
    (first, second) => first.startsAt.getTime() - second.startsAt.getTime(),
  );
}

function addSlot(slots: Map<string, GeneratedSlot>, slot: GeneratedSlot): void {
  const key = `${slot.startsAt.getTime()}:${slot.endsAt.getTime()}`;
  const existing = slots.get(key);

  if (!existing) {
    slots.set(key, slot);
    return;
  }

  existing.staffIds.push(...slot.staffIds);

  if (slot.seatsLeft !== null) {
    existing.seatsLeft = Math.max(existing.seatsLeft ?? 0, slot.seatsLeft);
  }
}

/** Expands weekly rules into merged UTC windows overlapping [rangeStart, rangeEnd). */
export function expandWeeklyRules(
  rules: WeeklyRule[],
  rangeStart: number,
  rangeEnd: number,
  closedDates: ReadonlySet<string>,
): AvailabilityWindow[] {
  const windows: AvailabilityWindow[] = [];

  for (const rule of rules) {
    // Start a day early so overnight shifts from the previous day are included.
    const firstDate = localDateOf(rangeStart - MILLISECONDS_PER_DAY, rule.timeZone);
    const lastDate = localDateOf(rangeEnd, rule.timeZone);

    for (let date = firstDate; date <= lastDate; date = addDaysToLocalDate(date, 1)) {
      if (closedDates.has(date) || getIsoWeekday(date) !== rule.weekday) continue;

      const start = wallClockToUtc(date, rule.startMinute, rule.timeZone).getTime();
      const end = wallClockToUtc(date, rule.endMinute, rule.timeZone).getTime();

      if (end > rangeStart && start < rangeEnd && end > start) {
        windows.push({ start, end, anchor: start });
      }
    }
  }

  return mergeWindows(windows);
}

function mergeWindows(windows: AvailabilityWindow[]): AvailabilityWindow[] {
  const sorted = [...windows].sort((first, second) => first.start - second.start);
  const merged: AvailabilityWindow[] = [];

  for (const window of sorted) {
    const last = merged.at(-1);

    if (last && window.start <= last.end) {
      last.end = Math.max(last.end, window.end);
    } else {
      merged.push({ ...window });
    }
  }

  return merged;
}

/** Removes blocked intervals from windows; each piece keeps its window's anchor. */
export function subtractIntervals(
  windows: AvailabilityWindow[],
  blocked: Array<{ start: number; end: number }>,
): AvailabilityWindow[] {
  const sortedBlocked = [...blocked]
    .filter((interval) => interval.end > interval.start)
    .sort((first, second) => first.start - second.start);
  const result: AvailabilityWindow[] = [];

  for (const window of windows) {
    let cursor = window.start;

    for (const interval of sortedBlocked) {
      if (interval.end <= cursor || interval.start >= window.end) continue;

      if (interval.start > cursor) {
        result.push({ start: cursor, end: interval.start, anchor: window.anchor });
      }

      cursor = Math.max(cursor, interval.end);

      if (cursor >= window.end) break;
    }

    if (cursor < window.end) {
      result.push({ start: cursor, end: window.end, anchor: window.anchor });
    }
  }

  return result;
}

function resourcesHaveRoom(
  resources: ResourceSchedule[],
  occupied: { start: number; end: number },
): boolean {
  return resources.every(
    (resource) =>
      maxConcurrency(resource.busy.map(toMilliseconds), occupied) < resource.capacity,
  );
}

/** Highest number of intervals overlapping at any instant inside `range`. */
export function maxConcurrency(
  intervals: Array<{ start: number; end: number }>,
  range: { start: number; end: number },
): number {
  const events: Array<[number, number]> = [];

  for (const interval of intervals) {
    const start = Math.max(interval.start, range.start);
    const end = Math.min(interval.end, range.end);

    if (end > start) {
      events.push([start, 1], [end, -1]);
    }
  }

  // Ends sort before starts at the same instant, so touching intervals do not stack.
  events.sort((first, second) => first[0] - second[0] || first[1] - second[1]);

  let current = 0;
  let maximum = 0;

  for (const [, delta] of events) {
    current += delta;
    maximum = Math.max(maximum, current);
  }

  return maximum;
}

function toMilliseconds(interval: TimeInterval): { start: number; end: number } {
  return { start: interval.startsAt.getTime(), end: interval.endsAt.getTime() };
}

function overlaps(
  first: { start: number; end: number },
  second: { start: number; end: number },
): boolean {
  return first.start < second.end && second.start < first.end;
}

function localDateOf(instant: number, timeZone: string): string {
  const values = getLocalDateTimeValues(new Date(instant), timeZone);

  if (!values) throw new RangeError(`Cannot resolve time zone ${timeZone}`);

  return values.date;
}
