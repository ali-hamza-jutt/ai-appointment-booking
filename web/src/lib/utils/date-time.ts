export interface LocalDateTimeInputValues {
  date: string;
  time: string;
}

export function getLocalDateTimeInputValues(
  value: string | Date,
  timeZone: string,
): LocalDateTimeInputValues | null {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  try {
    const parts = new Map(
      new Intl.DateTimeFormat("en-US", {
        calendar: "iso8601",
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
        month: "2-digit",
        numberingSystem: "latn",
        timeZone,
        year: "numeric",
      })
        .formatToParts(date)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    const year = parts.get("year");
    const month = parts.get("month");
    const day = parts.get("day");
    const hour = parts.get("hour");
    const minute = parts.get("minute");

    if (!year || !month || !day || !hour || !minute) return null;

    return {
      date: `${year}-${month}-${day}`,
      time: `${hour}:${minute}`,
    };
  } catch {
    return null;
  }
}

export function getCurrentLocalDate(timeZone: string): string {
  return getLocalDateTimeInputValues(new Date(), timeZone)?.date ?? "";
}

export function formatDate(value: string | Date, timeZone?: string): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

function getOffsetMinutes(instant: number, timeZone: string): number {
  const parts = getLocalDateTimeInputValues(new Date(instant), timeZone);

  if (!parts) return 0;

  const [year, month, day] = parts.date.split("-").map(Number) as [number, number, number];
  const [hour, minute] = parts.time.split(":").map(Number) as [number, number];

  return Math.round(
    (Date.UTC(year, month - 1, day, hour, minute) - Math.floor(instant / 60_000) * 60_000) /
      60_000,
  );
}

/** Converts a date and HH:mm wall time in `timeZone` to an ISO instant. */
export function zonedDateTimeToIso(date: string, time: string, timeZone: string): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);

  if (!dateMatch || !timeMatch) return null;

  const wallClock = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
  );
  const firstGuess = wallClock - getOffsetMinutes(wallClock, timeZone) * 60_000;
  const instant = wallClock - getOffsetMinutes(firstGuess, timeZone) * 60_000;

  return new Date(instant).toISOString();
}

export function addDaysToDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}

export function formatDateTime(value: string | Date, timeZone?: string): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function formatLocalDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(`${date}T00:00:00Z`));
}
