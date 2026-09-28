import type { WaitlistEntryResponse } from "@/generated/api/models";

function dayLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

/** "Tue, Oct 6 to Mon, Oct 12 · mornings" */
export function describeWaitlistWindow(entry: Pick<WaitlistEntryResponse, "fromDate" | "toDate" | "partOfDay">): string {
  const dates = entry.fromDate === entry.toDate ? dayLabel(entry.fromDate) : `${dayLabel(entry.fromDate)} to ${dayLabel(entry.toDate)}`;

  return entry.partOfDay ? `${dates} · ${entry.partOfDay}s` : dates;
}
