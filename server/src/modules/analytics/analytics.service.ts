import { logger } from "../../config/logger.js";
import { ANALYTICS_CONSTANTS, ERROR_CODES, ERROR_MESSAGES } from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import {
  addDaysToLocalDate,
  getIsoWeekday,
  getLocalDateTimeValues,
  isValidLocalDate,
  wallClockToUtc,
} from "../../utils/time-zone.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { analyticsDal, type MetricRange } from "./dal/analytics.dal.js";
import type { AnalyticsDay, AnalyticsResponse, DailyMetrics } from "./dto/analytics.dto.js";

const MINUTE = 60_000;
const STAFF_BOOKED = "staff_booked_minutes:";
const STAFF_OPEN = "staff_open_minutes:";

function hourMetric(hour: number): string {
  return `hour_${String(hour).padStart(2, "0")}`;
}

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];

  for (let date = from; date <= to; date = addDaysToLocalDate(date, 1)) dates.push(date);

  return dates;
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1_000) / 1_000 : null;
}

function overlapMinutes(start: Date, end: Date, otherStart: Date, otherEnd: Date): number {
  return Math.max(0, Math.min(end.getTime(), otherEnd.getTime()) - Math.max(start.getTime(), otherStart.getTime())) / MINUTE;
}

/**
 * Numbers for the owner's analytics page. Each local day's figures are
 * worked out in SQL and stored nightly as DailyMetric rows; days not stored
 * yet (today, or a new business) are worked out on the spot.
 */
export class AnalyticsService {
  public async getAnalytics(businessId: string, fromInput?: string, toInput?: string, now: Date = new Date()): Promise<AnalyticsResponse> {
    const business = await analyticsDal.findBusiness(businessId);

    if (!business) throw new AppError(404, ERROR_CODES.BUSINESS_NOT_FOUND, ERROR_MESSAGES.BUSINESS_NOT_FOUND);

    const today = this.localToday(business.timeZone, now);
    const to = toInput ?? today;
    const from = fromInput ?? addDaysToLocalDate(to, -29);

    if (!isValidLocalDate(from)) throwRequestValidationError("from", "Use a date like 2026-10-01");
    if (!isValidLocalDate(to)) throwRequestValidationError("to", "Use a date like 2026-10-31");
    if (from > to) throwRequestValidationError("to", "The end date must be on or after the start date");
    if (datesBetween(from, to).length > ANALYTICS_CONSTANTS.MAX_RANGE_DAYS) {
      throwRequestValidationError("from", `Choose at most ${ANALYTICS_CONSTANTS.MAX_RANGE_DAYS} days`);
    }

    const metrics = await this.loadMetrics(business.id, business.timeZone, from, to, today);

    return this.toResponse(business, from, to, metrics, await analyticsDal.listActiveStaff(business.id));
  }

  /** The nightly job: stores the last few finished days of every business. */
  public async storeRecentDays(now: Date = new Date()): Promise<number> {
    let stored = 0;

    for (const business of await analyticsDal.listBusinesses()) {
      try {
        const yesterday = addDaysToLocalDate(this.localToday(business.timeZone, now), -1);
        const from = addDaysToLocalDate(yesterday, -(ANALYTICS_CONSTANTS.RECOMPUTE_DAYS - 1));

        await this.storeDays(business.id, business.timeZone, from, yesterday);
        stored += 1;
      } catch (error) {
        // One business's failure shouldn't stop the others; the next night tries again.
        logger.error({ err: error, businessId: business.id }, "Computing daily metrics failed");
      }
    }

    return stored;
  }

  /** Works out and stores the metrics of these local days, replacing what was there. */
  public async storeDays(businessId: string, timeZone: string, from: string, to: string): Promise<void> {
    const metrics = await this.computeMetrics(businessId, timeZone, from, to);
    const rows = [...metrics].flatMap(([date, values]) =>
      [...values].map(([metric, value]) => ({ date, metric, value })),
    );

    await analyticsDal.replaceMetrics(businessId, datesBetween(from, to), rows);
  }

  /** Stored days as they are; the rest worked out now, in one pass over the span they cover. */
  private async loadMetrics(businessId: string, timeZone: string, from: string, to: string, today: string): Promise<DailyMetrics> {
    const metrics: DailyMetrics = new Map();

    for (const row of await analyticsDal.listStoredMetrics(businessId, from, to)) {
      const date = row.date.toISOString().slice(0, 10);
      const day = metrics.get(date) ?? new Map<string, number>();

      day.set(row.metric, row.value);
      metrics.set(date, day);
    }

    // Today is still changing, so it is never read from storage.
    const missing = datesBetween(from, to).filter((date) => date >= today || !metrics.has(date));

    if (missing.length > 0) {
      const live = await this.computeMetrics(businessId, timeZone, missing[0] as string, missing.at(-1) as string);

      for (const date of missing) metrics.set(date, live.get(date) ?? new Map());
    }

    return metrics;
  }

  private async computeMetrics(businessId: string, timeZone: string, from: string, to: string): Promise<DailyMetrics> {
    const range: MetricRange = {
      businessId,
      timeZone,
      from,
      to,
      scanFrom: wallClockToUtc(addDaysToLocalDate(from, -1), 0, timeZone),
      scanTo: wallClockToUtc(addDaysToLocalDate(to, 2), 0, timeZone),
    };
    const metrics: DailyMetrics = new Map(datesBetween(from, to).map((date) => [date, new Map<string, number>()]));
    const add = (date: string, metric: string, value: number | bigint) => {
      const day = metrics.get(date);

      if (day && Number(value) !== 0) day.set(metric, (day.get(metric) ?? 0) + Number(value));
    };
    const [visits, hours, booked, made, chats] = await Promise.all([
      analyticsDal.visitsByDay(range),
      analyticsDal.visitsByHour(range),
      analyticsDal.bookedMinutesByStaff(range),
      analyticsDal.bookingsMadeByDay(range),
      analyticsDal.chatsByDay(range),
    ]);

    for (const row of visits) {
      add(row.day, "visits", row.visits);
      add(row.day, "completed", row.completed);
      add(row.day, "cancelled", row.cancelled);
      add(row.day, "no_shows", row.no_shows);
      add(row.day, "revenue_minor", row.revenue_minor);
    }
    for (const row of hours) add(row.day, hourMetric(row.hour), row.visits);
    for (const row of booked) add(row.day, `${STAFF_BOOKED}${row.staff_id}`, row.minutes);
    for (const row of made) add(row.day, "bookings_made", row.count);
    for (const row of chats) {
      add(row.day, "chats_started", row.started);
      add(row.day, "chats_booked", row.booked);
      add(row.day, "chat_turns_to_book", row.turns_to_book);
      add(row.day, "chat_handoffs", row.handoffs);
      add(row.day, "chat_dropped_before_service", row.dropped_before_service);
      add(row.day, "chat_dropped_after_service", row.dropped_after_service);
      add(row.day, "chat_dropped_at_time", row.dropped_at_time);
    }

    await this.addOpenMinutes(range, add);

    return metrics;
  }

  /** Each provider's working hours per day, less time off and days the business is closed. */
  private async addOpenMinutes(range: MetricRange, add: (date: string, metric: string, value: number) => void): Promise<void> {
    const [staff, hours, timeOff, closed] = await Promise.all([
      analyticsDal.listActiveStaff(range.businessId),
      analyticsDal.listWorkingHours(range.businessId),
      analyticsDal.listTimeOff(range.businessId, range.scanFrom, range.scanTo),
      analyticsDal.listClosedDates(range.businessId, range.from, range.to),
    ]);

    for (const date of datesBetween(range.from, range.to)) {
      if (closed.has(date)) continue;

      const weekday = getIsoWeekday(date);

      for (const member of staff) {
        let open = 0;

        for (const interval of hours.filter((item) => item.staffId === member.id && item.weekday === weekday)) {
          // An overnight shift ends after midnight.
          const endMinute = interval.endMinute > interval.startMinute ? interval.endMinute : interval.endMinute + 24 * 60;
          const start = wallClockToUtc(date, interval.startMinute, range.timeZone);
          const end = wallClockToUtc(date, endMinute, range.timeZone);
          const away = timeOff
            .filter((item) => item.staffId === member.id)
            .reduce((sum, item) => sum + overlapMinutes(start, end, item.startsAt, item.endsAt), 0);

          open += Math.max(0, (end.getTime() - start.getTime()) / MINUTE - away);
        }

        add(date, `${STAFF_OPEN}${member.id}`, Math.round(open));
      }
    }
  }

  private toResponse(
    business: { timeZone: string; currency: string },
    from: string,
    to: string,
    metrics: DailyMetrics,
    staff: Array<{ id: string; displayName: string }>,
  ): AnalyticsResponse {
    const sum = (metric: string) => [...metrics.values()].reduce((total, day) => total + (day.get(metric) ?? 0), 0);
    const days: AnalyticsDay[] = datesBetween(from, to).map((date) => {
      const day = metrics.get(date) ?? new Map<string, number>();
      const value = (metric: string) => day.get(metric) ?? 0;

      return {
        date,
        bookingsMade: value("bookings_made"),
        visits: value("visits"),
        completed: value("completed"),
        cancelled: value("cancelled"),
        noShows: value("no_shows"),
        revenueMinor: value("revenue_minor"),
      };
    });
    const totals = {
      bookingsMade: sum("bookings_made"),
      visits: sum("visits"),
      completed: sum("completed"),
      cancelled: sum("cancelled"),
      noShows: sum("no_shows"),
      revenueMinor: sum("revenue_minor"),
    };
    const chatsStarted = sum("chats_started");
    const chatsBooked = sum("chats_booked");
    const handoffs = sum("chat_handoffs");

    return {
      from,
      to,
      timeZone: business.timeZone,
      currency: business.currency,
      days,
      totals: {
        ...totals,
        cancellationRate: ratio(totals.cancelled, totals.visits + totals.cancelled),
        noShowRate: ratio(totals.noShows, totals.completed + totals.noShows),
      },
      busiestHours: Array.from({ length: 24 }, (_, hour) => ({ hour, visits: sum(hourMetric(hour)) })),
      providers: staff.map((member) => {
        const bookedMinutes = sum(`${STAFF_BOOKED}${member.id}`);
        const openMinutes = sum(`${STAFF_OPEN}${member.id}`);

        return { staffId: member.id, name: member.displayName, bookedMinutes, openMinutes, utilisation: ratio(bookedMinutes, openMinutes) };
      }),
      assistant: {
        chatsStarted,
        chatsBooked,
        conversionRate: ratio(chatsBooked, chatsStarted),
        averageTurnsToBook: chatsBooked > 0 ? Math.round((sum("chat_turns_to_book") / chatsBooked) * 10) / 10 : null,
        handoffs,
        handoffRate: ratio(handoffs, chatsStarted),
        dropOff: {
          beforeChoosingService: sum("chat_dropped_before_service"),
          afterChoosingService: sum("chat_dropped_after_service"),
          atHeldTime: sum("chat_dropped_at_time"),
        },
      },
    };
  }

  private localToday(timeZone: string, now: Date): string {
    return getLocalDateTimeValues(now, timeZone)?.date ?? now.toISOString().slice(0, 10);
  }
}

export const analyticsService = new AnalyticsService();
