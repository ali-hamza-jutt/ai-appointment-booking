/** A future YYYY-MM-DD (UTC) falling on the given ISO weekday, at least `minDaysAhead` out. */
export function nextIsoWeekday(isoWeekday: number, minDaysAhead = 2): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + minDaysAhead);

  while ((date.getUTCDay() === 0 ? 7 : date.getUTCDay()) !== isoWeekday) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return date.toISOString().slice(0, 10);
}

/** Today's date in UTC, YYYY-MM-DD. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The ISO weekday (1 = Monday … 7 = Sunday) of a YYYY-MM-DD date. */
export function isoWeekdayOf(localDate: string): number {
  const weekday = new Date(`${localDate}T00:00:00Z`).getUTCDay();

  return weekday === 0 ? 7 : weekday;
}

export function addDays(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}
