import { NOTIFICATION_CONSTANTS } from "../../constants/app.constants.js";
import {
  addDaysToLocalDate,
  getLocalDateTimeValues,
  localDateTimeToUtc,
  localTimeToMinutes,
} from "../../utils/time-zone.js";
import type { PlannedReminder } from "./dto/notification.dto.js";

export interface QuietHours {
  /** HH:mm local; equal to `end` means no quiet hours. */
  start: string;
  end: string;
}

function isQuiet(minute: number, start: number, end: number): boolean {
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/**
 * Moves a send time that falls in quiet hours (in the customer's time zone)
 * back to when those quiet hours began, so a 2-hours-before reminder for an
 * 8 am visit arrives the evening before rather than at 6 am. A time that
 * would then be in the past is left as it was.
 */
export function outsideQuietHours(sendAt: Date, quiet: QuietHours, timeZone: string, now: Date): Date {
  const start = localTimeToMinutes(quiet.start);
  const end = localTimeToMinutes(quiet.end);
  const local = getLocalDateTimeValues(sendAt, timeZone);
  const minute = local ? localTimeToMinutes(local.time) : null;

  if (start === null || end === null || start === end || !local || minute === null || !isQuiet(minute, start, end)) {
    return sendAt;
  }

  // Past midnight in hours that wrap (21:00–08:00), they began the evening before.
  const startDate = start > end && minute < end ? addDaysToLocalDate(local.date, -1) : local.date;
  const quietStart = localDateTimeToUtc(startDate, quiet.start, timeZone);

  return quietStart && quietStart.getTime() > now.getTime() ? quietStart : sendAt;
}

/**
 * When each reminder should go out: one per distinct offset before the
 * start, moved out of quiet hours. Reminders already due are dropped, so a
 * booking made an hour ahead gets no 24-hour reminder.
 */
export function planReminders(
  scheduledAt: Date,
  offsetsMinutes: readonly number[],
  quiet: QuietHours,
  timeZone: string,
  now: Date,
): PlannedReminder[] {
  const grace = NOTIFICATION_CONSTANTS.REMINDER_GRACE_MINUTES * 60_000;

  return [...new Set(offsetsMinutes)]
    .sort((a, b) => b - a)
    .flatMap((offsetMinutes) => {
      const due = new Date(scheduledAt.getTime() - offsetMinutes * 60_000);

      if (due.getTime() < now.getTime() - grace) return [];

      return [{ offsetMinutes, sendAt: outsideQuietHours(due, quiet, timeZone, now) }];
    });
}
