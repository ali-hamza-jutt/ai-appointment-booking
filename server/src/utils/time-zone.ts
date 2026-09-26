import { AI_CONSTANTS } from "../constants/app.constants.js";

interface LocalDateTimeParts {
  day: number;
  hour: number;
  minute: number;
  month: number;
  year: number;
}

export interface LocalDateTimeValues {
  date: string;
  time: string;
}

const MIN_TIME_ZONE_OFFSET_MINUTES = -14 * 60;
const MAX_TIME_ZONE_OFFSET_MINUTES = 14 * 60;
const TIME_ZONE_OFFSET_STEP_MINUTES = 15;
const MILLISECONDS_PER_MINUTE = 60_000;
const MILLISECONDS_PER_DAY = 86_400_000;

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

export function getLocalDateTimeValues(
  value: Date,
  timeZone: string,
): LocalDateTimeValues | null {
  if (Number.isNaN(value.getTime())) return null;

  const normalizedTimeZone = normalizeIanaTimeZone(timeZone);

  if (!normalizedTimeZone) return null;

  const formatter = createLocalDateTimeFormatter(normalizedTimeZone);
  const parts = getLocalDateTimeParts(value, formatter);

  if (!parts) return null;

  return {
    date: `${parts.year.toString().padStart(4, "0")}-${parts.month
      .toString()
      .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`,
    time: `${parts.hour.toString().padStart(2, "0")}:${parts.minute
      .toString()
      .padStart(2, "0")}`,
  };
}

export function localDateTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
): Date | null {
  const normalizedTimeZone = normalizeIanaTimeZone(timeZone);
  const requestedParts = parseLocalDateTime(date, time);

  if (!normalizedTimeZone || !requestedParts) return null;

  const formatter = createLocalDateTimeFormatter(normalizedTimeZone);
  const localAsUtc = new Date(0);
  localAsUtc.setUTCFullYear(
    requestedParts.year,
    requestedParts.month - 1,
    requestedParts.day,
  );
  localAsUtc.setUTCHours(requestedParts.hour, requestedParts.minute, 0, 0);

  if (!matchesUtcParts(localAsUtc, requestedParts)) return null;

  const matchingInstants: Date[] = [];

  for (
    let offsetMinutes = MIN_TIME_ZONE_OFFSET_MINUTES;
    offsetMinutes <= MAX_TIME_ZONE_OFFSET_MINUTES;
    offsetMinutes += TIME_ZONE_OFFSET_STEP_MINUTES
  ) {
    const candidate = new Date(
      localAsUtc.getTime() - offsetMinutes * MILLISECONDS_PER_MINUTE,
    );
    const candidateParts = getLocalDateTimeParts(candidate, formatter);

    if (candidateParts && partsMatch(candidateParts, requestedParts)) {
      matchingInstants.push(candidate);
    }
  }

  // Zero matches means a nonexistent wall time (for example a DST gap).
  // Multiple matches means an ambiguous wall time (for example a DST fold).
  return matchingInstants.length === 1 ? matchingInstants[0]! : null;
}

function createLocalDateTimeFormatter(
  timeZone: string,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    calendar: "iso8601",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    numberingSystem: "latn",
    timeZone,
    year: "numeric",
  });
}

function getLocalDateTimeParts(
  value: Date,
  formatter: Intl.DateTimeFormat,
): LocalDateTimeParts | null {
  const values = new Map(
    formatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const parts: LocalDateTimeParts = {
    day: values.get("day") ?? Number.NaN,
    hour: values.get("hour") ?? Number.NaN,
    minute: values.get("minute") ?? Number.NaN,
    month: values.get("month") ?? Number.NaN,
    year: values.get("year") ?? Number.NaN,
  };

  return Object.values(parts).every(Number.isInteger) ? parts : null;
}

function parseLocalDateTime(
  date: string,
  time: string,
): LocalDateTimeParts | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);

  if (!dateMatch || !timeMatch) return null;

  const parts: LocalDateTimeParts = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
  };

  return parts.year >= 1 ? parts : null;
}

function matchesUtcParts(
  value: Date,
  expected: LocalDateTimeParts,
): boolean {
  return (
    value.getUTCFullYear() === expected.year &&
    value.getUTCMonth() + 1 === expected.month &&
    value.getUTCDate() === expected.day &&
    value.getUTCHours() === expected.hour &&
    value.getUTCMinutes() === expected.minute
  );
}

function partsMatch(
  actual: LocalDateTimeParts,
  expected: LocalDateTimeParts,
): boolean {
  return (
    actual.year === expected.year &&
    actual.month === expected.month &&
    actual.day === expected.day &&
    actual.hour === expected.hour &&
    actual.minute === expected.minute
  );
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getCachedFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);

  if (!formatter) {
    formatter = createLocalDateTimeFormatter(timeZone);
    formatterCache.set(timeZone, formatter);
  }

  return formatter;
}

/** Minutes the zone is ahead of UTC at `instant` (e.g. +60 for BST). */
export function getTimeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = getLocalDateTimeParts(instant, getCachedFormatter(timeZone));

  if (!parts) throw new RangeError(`Cannot resolve time zone ${timeZone}`);

  const wallClockAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  const instantToMinute =
    Math.floor(instant.getTime() / MILLISECONDS_PER_MINUTE) * MILLISECONDS_PER_MINUTE;

  return Math.round((wallClockAsUtc - instantToMinute) / MILLISECONDS_PER_MINUTE);
}

/**
 * Converts a wall-clock time to an instant. `minuteOfDay` may exceed 1440 for
 * overnight shifts. A time in a spring-forward gap moves forward by the gap
 * (London 01:30 on the change day becomes 02:30 BST); an ambiguous time in an
 * autumn fold resolves to its first occurrence.
 */
export function wallClockToUtc(
  localDate: string,
  minuteOfDay: number,
  timeZone: string,
): Date {
  const [year, month, day] = localDate.split("-").map(Number) as [number, number, number];
  const wallClockAsUtc =
    Date.UTC(year, month - 1, day) + minuteOfDay * MILLISECONDS_PER_MINUTE;
  // Offsets a day either side bracket at most one transition.
  const candidates = [-1, 1]
    .map((direction) =>
      getTimeZoneOffsetMinutes(
        new Date(wallClockAsUtc + direction * MILLISECONDS_PER_DAY),
        timeZone,
      ),
    )
    .map((offset) => wallClockAsUtc - offset * MILLISECONDS_PER_MINUTE);
  const exact = candidates.filter(
    (candidate) =>
      candidate + getTimeZoneOffsetMinutes(new Date(candidate), timeZone) *
        MILLISECONDS_PER_MINUTE ===
      wallClockAsUtc,
  );

  return new Date(exact.length > 0 ? Math.min(...exact) : Math.max(...candidates));
}

/** Adds whole days to a YYYY-MM-DD calendar date. */
export function addDaysToLocalDate(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number) as [number, number, number];

  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
export function getIsoWeekday(localDate: string): number {
  const [year, month, day] = localDate.split("-").map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return weekday === 0 ? 7 : weekday;
}

export function isValidLocalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) return false;

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));

  return date.toISOString().slice(0, 10) === value;
}

export function localTimeToMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);

  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function minutesToLocalTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;

  return `${Math.floor(normalized / 60)
    .toString()
    .padStart(2, "0")}:${(normalized % 60).toString().padStart(2, "0")}`;
}
