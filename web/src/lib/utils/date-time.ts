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
