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

export function addDays(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}
