import { prisma } from "../../../infrastructure/database/prisma.js";

/** A local date range at one business; `from` and `to` are inclusive YYYY-MM-DD dates. */
export interface MetricRange {
  businessId: string;
  timeZone: string;
  from: string;
  to: string;
  /** Instants a day either side of the range, so the indexes narrow the scan before local dates are worked out. */
  scanFrom: Date;
  scanTo: Date;
}

export interface VisitRow {
  day: string;
  visits: bigint;
  completed: bigint;
  cancelled: bigint;
  no_shows: bigint;
  revenue_minor: bigint;
}

export interface HourRow {
  day: string;
  hour: number;
  visits: bigint;
}

export interface StaffMinutesRow {
  day: string;
  staff_id: string;
  minutes: bigint;
}

export interface CountRow {
  day: string;
  count: bigint;
}

export interface ChatRow {
  day: string;
  started: bigint;
  handoffs: bigint;
  booked: bigint;
  turns_to_book: bigint;
  dropped_before_service: bigint;
  dropped_after_service: bigint;
  dropped_at_time: bigint;
}

/**
 * The SQL behind the analytics page. A booking counts once it was ever
 * confirmed or sent for approval, so released holds and unpaid deposits
 * never show up as bookings or cancellations.
 */
export class AnalyticsDal {
  /** Visits by the local date they are (or were) for. */
  public visitsByDay(range: MetricRange): Promise<VisitRow[]> {
    return prisma.$queryRaw<VisitRow[]>`
      SELECT to_char((b.scheduled_at AT TIME ZONE ${range.timeZone})::date, 'YYYY-MM-DD') AS day,
        COUNT(*) FILTER (WHERE b.status <> 'CANCELLED') AS visits,
        COUNT(*) FILTER (WHERE b.status = 'COMPLETED') AS completed,
        COUNT(*) FILTER (WHERE b.status = 'CANCELLED') AS cancelled,
        COUNT(*) FILTER (WHERE b.status = 'NO_SHOW') AS no_shows,
        COALESCE(SUM(b.price_minor) FILTER (WHERE b.status = 'COMPLETED'), 0)::bigint AS revenue_minor
      FROM bookings b
      WHERE b.business_id = ${range.businessId}::uuid
        AND b.scheduled_at >= ${range.scanFrom} AND b.scheduled_at < ${range.scanTo}
        AND (b.scheduled_at AT TIME ZONE ${range.timeZone})::date BETWEEN ${range.from}::date AND ${range.to}::date
        AND EXISTS (
          SELECT 1 FROM booking_events e
          WHERE e.booking_id = b.id AND e.to_status IN ('CONFIRMED', 'PENDING')
        )
      GROUP BY 1
    `;
  }

  /** Visits that weren't cancelled, by local date and starting hour. */
  public visitsByHour(range: MetricRange): Promise<HourRow[]> {
    return prisma.$queryRaw<HourRow[]>`
      SELECT to_char((b.scheduled_at AT TIME ZONE ${range.timeZone})::date, 'YYYY-MM-DD') AS day,
        EXTRACT(HOUR FROM b.scheduled_at AT TIME ZONE ${range.timeZone})::int AS hour,
        COUNT(*) AS visits
      FROM bookings b
      WHERE b.business_id = ${range.businessId}::uuid
        AND b.scheduled_at >= ${range.scanFrom} AND b.scheduled_at < ${range.scanTo}
        AND (b.scheduled_at AT TIME ZONE ${range.timeZone})::date BETWEEN ${range.from}::date AND ${range.to}::date
        AND b.status IN ('CONFIRMED', 'PENDING', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW')
      GROUP BY 1, 2
    `;
  }

  /** Minutes each provider was booked for, by local date. */
  public bookedMinutesByStaff(range: MetricRange): Promise<StaffMinutesRow[]> {
    return prisma.$queryRaw<StaffMinutesRow[]>`
      SELECT to_char((b.scheduled_at AT TIME ZONE ${range.timeZone})::date, 'YYYY-MM-DD') AS day,
        b.staff_id::text AS staff_id,
        SUM(b.duration_minutes)::bigint AS minutes
      FROM bookings b
      WHERE b.business_id = ${range.businessId}::uuid
        AND b.staff_id IS NOT NULL
        AND b.scheduled_at >= ${range.scanFrom} AND b.scheduled_at < ${range.scanTo}
        AND (b.scheduled_at AT TIME ZONE ${range.timeZone})::date BETWEEN ${range.from}::date AND ${range.to}::date
        AND b.status IN ('CONFIRMED', 'PENDING', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW')
      GROUP BY 1, 2
    `;
  }

  /** New bookings by the local date they were first confirmed or requested. */
  public bookingsMadeByDay(range: MetricRange): Promise<CountRow[]> {
    return prisma.$queryRaw<CountRow[]>`
      SELECT to_char((made.at AT TIME ZONE ${range.timeZone})::date, 'YYYY-MM-DD') AS day, COUNT(*) AS count
      FROM (
        SELECT MIN(e.created_at) AS at
        FROM booking_events e
        WHERE e.business_id = ${range.businessId}::uuid
          AND e.to_status IN ('CONFIRMED', 'PENDING')
        GROUP BY e.booking_id
      ) made
      WHERE made.at >= ${range.scanFrom} AND made.at < ${range.scanTo}
        AND (made.at AT TIME ZONE ${range.timeZone})::date BETWEEN ${range.from}::date AND ${range.to}::date
      GROUP BY 1
    `;
  }

  /**
   * Chats with the assistant by the local date they began (only chats where
   * the customer wrote something): how many booked, how many messages that
   * took, how many were handed to staff, and where the rest stopped.
   */
  public chatsByDay(range: MetricRange): Promise<ChatRow[]> {
    return prisma.$queryRaw<ChatRow[]>`
      SELECT to_char((s.created_at AT TIME ZONE ${range.timeZone})::date, 'YYYY-MM-DD') AS day,
        COUNT(*) AS started,
        COUNT(*) FILTER (WHERE s.handoff_requested_at IS NOT NULL) AS handoffs,
        COUNT(*) FILTER (WHERE booked.at IS NOT NULL) AS booked,
        COALESCE(SUM(turns.count) FILTER (WHERE booked.at IS NOT NULL), 0)::bigint AS turns_to_book,
        COUNT(*) FILTER (WHERE booked.at IS NULL AND NOT held.any AND s.draft_service_id IS NULL) AS dropped_before_service,
        COUNT(*) FILTER (WHERE booked.at IS NULL AND NOT held.any AND s.draft_service_id IS NOT NULL) AS dropped_after_service,
        COUNT(*) FILTER (WHERE booked.at IS NULL AND held.any) AS dropped_at_time
      FROM chat_sessions s
      LEFT JOIN LATERAL (
        SELECT MIN(e.created_at) AS at
        FROM bookings b JOIN booking_events e ON e.booking_id = b.id
        WHERE b.chat_session_id = s.id AND e.to_status IN ('CONFIRMED', 'PENDING')
      ) booked ON true
      -- A time held in chat is the chat's draft hold; only a confirmed booking carries the chat's id.
      LEFT JOIN LATERAL (
        SELECT (s.draft_hold_id IS NOT NULL OR EXISTS (SELECT 1 FROM bookings b WHERE b.chat_session_id = s.id)) AS any
      ) held ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS count FROM chat_messages m
        WHERE m.session_id = s.id AND m.role = 'USER' AND m.created_at <= booked.at
      ) turns ON true
      WHERE s.business_id = ${range.businessId}::uuid
        AND s.created_at >= ${range.scanFrom} AND s.created_at < ${range.scanTo}
        AND (s.created_at AT TIME ZONE ${range.timeZone})::date BETWEEN ${range.from}::date AND ${range.to}::date
        AND EXISTS (SELECT 1 FROM chat_messages m WHERE m.session_id = s.id AND m.role = 'USER')
      GROUP BY 1
    `;
  }

  public listActiveStaff(businessId: string) {
    return prisma.staff.findMany({
      where: { businessId, isActive: true },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    });
  }

  public listWorkingHours(businessId: string) {
    return prisma.workingHours.findMany({
      where: { businessId },
      select: { staffId: true, weekday: true, startMinute: true, endMinute: true },
    });
  }

  public listTimeOff(businessId: string, from: Date, to: Date) {
    return prisma.timeOff.findMany({
      where: { businessId, startsAt: { lt: to }, endsAt: { gt: from } },
      select: { staffId: true, startsAt: true, endsAt: true },
    });
  }

  public async listClosedDates(businessId: string, from: string, to: string): Promise<Set<string>> {
    const closures = await prisma.businessClosure.findMany({
      where: { businessId, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      select: { date: true },
    });

    return new Set(closures.map((closure) => closure.date.toISOString().slice(0, 10)));
  }

  public listStoredMetrics(businessId: string, from: string, to: string) {
    return prisma.dailyMetric.findMany({
      where: { businessId, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      select: { date: true, metric: true, value: true },
    });
  }

  /** Replaces the stored metrics of these days in one go. */
  public async replaceMetrics(
    businessId: string,
    days: string[],
    rows: Array<{ date: string; metric: string; value: number }>,
  ): Promise<void> {
    await prisma.$transaction([
      prisma.dailyMetric.deleteMany({
        where: { businessId, date: { in: days.map((day) => new Date(`${day}T00:00:00Z`)) } },
      }),
      prisma.dailyMetric.createMany({
        data: rows.map((row) => ({ businessId, date: new Date(`${row.date}T00:00:00Z`), metric: row.metric, value: row.value })),
      }),
    ]);
  }

  public listBusinesses() {
    return prisma.business.findMany({ select: { id: true, timeZone: true } });
  }

  public findBusiness(businessId: string) {
    return prisma.business.findUnique({ where: { id: businessId }, select: { id: true, timeZone: true, currency: true } });
  }
}

export const analyticsDal = new AnalyticsDal();
