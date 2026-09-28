import { addDaysToDate, getLocalDateTimeInputValues } from "@/lib/utils/date-time";

export const CALENDAR_CONSTANTS = {
  /** Clicks and drops snap to this many minutes. */
  SNAP_MINUTES: 15,
  PX_PER_MINUTE: 0.8,
  DEFAULT_START_HOUR: 7,
  DEFAULT_END_HOUR: 21,
} as const;

/** A local date and minutes since its midnight, in the business time zone. */
export interface LocalPoint {
  date: string;
  minutes: number;
}

export function toLocalPoint(value: string | Date, timeZone: string): LocalPoint | null {
  const parts = getLocalDateTimeInputValues(value, timeZone);

  if (!parts) return null;

  const [hour, minute] = parts.time.split(":").map(Number) as [number, number];

  return { date: parts.date, minutes: hour * 60 + minute };
}

/** The Monday of the week holding `date`. */
export function weekStart(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();

  return addDaysToDate(date, -((weekday + 6) % 7));
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}

export function snapMinutes(minutes: number): number {
  const snap = CALENDAR_CONSTANTS.SNAP_MINUTES;

  return Math.max(0, Math.min(24 * 60 - snap, Math.round(minutes / snap) * snap));
}

/** "09:05" from minutes since midnight. */
export function minutesToTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function timeToMinutes(time: string): number {
  const [hour = 0, minute = 0] = time.split(":").map(Number);

  return hour * 60 + minute;
}

export interface TimedItem {
  id: string;
  start: number;
  end: number;
}

export interface PlacedItem<T extends TimedItem> {
  item: T;
  /** Which of `lanes` side-by-side positions the item takes. */
  lane: number;
  lanes: number;
}

/**
 * Places overlapping items side by side. Items that overlap, directly or
 * through a chain, share a group and split its width into lanes.
 */
export function layoutColumn<T extends TimedItem>(items: T[]): PlacedItem<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: PlacedItem<T>[] = [];
  let group: PlacedItem<T>[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;

  const closeGroup = () => {
    for (const entry of group) entry.lanes = laneEnds.length;
    placed.push(...group);
    group = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (item.start >= groupEnd) closeGroup();

    let lane = laneEnds.findIndex((end) => end <= item.start);

    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }

    group.push({ item, lane, lanes: 0 });
    groupEnd = Math.max(groupEnd, item.end);
  }

  closeGroup();

  return placed;
}

/** Whole hours that fit every item, and never less than the default working day. */
export function visibleHours(items: Array<{ start: number; end: number }>): { startHour: number; endHour: number } {
  const earliest = Math.min(CALENDAR_CONSTANTS.DEFAULT_START_HOUR * 60, ...items.map((item) => item.start));
  const latest = Math.max(CALENDAR_CONSTANTS.DEFAULT_END_HOUR * 60, ...items.map((item) => item.end));

  return { startHour: Math.floor(earliest / 60), endHour: Math.min(24, Math.ceil(latest / 60)) };
}

export function formatHourLabel(hour: number): string {
  const suffix = hour < 12 || hour === 24 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;

  return `${display} ${suffix}`;
}
