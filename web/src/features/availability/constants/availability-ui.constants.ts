export const WEEKDAYS: ReadonlyArray<{ value: number; label: string; short: string }> = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 7, label: "Sunday", short: "Sun" },
];

export const AVAILABILITY_UI_CONSTANTS = {
  DEFAULT_SHIFT: { startTime: "09:00", endTime: "17:00" },
  WEEKDAY_VALUES: [1, 2, 3, 4, 5],
  PREVIEW_DAYS: 7,
  MAX_PREVIEW_SLOTS_PER_DAY: 12,
} as const;
