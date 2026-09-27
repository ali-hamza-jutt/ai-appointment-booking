import { prisma } from "../../../infrastructure/database/prisma.js";
import type { BusyInterval } from "../../../integrations/calendar/calendar.dto.js";
import type {
  BookingCalendarRecord,
  CalendarConnectionRecord,
  CalendarSyncJobData,
  CalendarWatchData,
  SaveCalendarConnectionData,
  StaffCalendarAccessRecord,
} from "../dto/calendar.dto.js";

export const calendarConnectionSelect = {
  id: true,
  businessId: true,
  staffId: true,
  provider: true,
  status: true,
  accountEmail: true,
  refreshTokenEncrypted: true,
  accessTokenEncrypted: true,
  accessTokenExpiresAt: true,
  channelId: true,
  channelResourceId: true,
  channelTokenHash: true,
  channelExpiresAt: true,
  busyHash: true,
  lastSyncedAt: true,
  lastError: true,
  createdAt: true,
} as const;

/** Bookings that keep their event in the staff member's calendar. */
const EVENT_STATUSES = ["CONFIRMED", "CHECKED_IN", "COMPLETED", "NO_SHOW"] as const;

export class CalendarDal {
  public findStaff(businessId: string, staffId: string): Promise<StaffCalendarAccessRecord | null> {
    return prisma.staff.findFirst({ where: { businessId, id: staffId }, select: { id: true, userId: true } });
  }

  public listConnections(businessId: string): Promise<CalendarConnectionRecord[]> {
    return prisma.calendarConnection.findMany({
      where: { businessId },
      orderBy: { createdAt: "asc" },
      select: calendarConnectionSelect,
    });
  }

  public findConnection(businessId: string, connectionId: string): Promise<CalendarConnectionRecord | null> {
    return prisma.calendarConnection.findFirst({
      where: { businessId, id: connectionId },
      select: calendarConnectionSelect,
    });
  }

  public findConnectionForStaff(businessId: string, staffId: string): Promise<CalendarConnectionRecord | null> {
    return prisma.calendarConnection.findFirst({ where: { businessId, staffId }, select: calendarConnectionSelect });
  }

  public findConnectionByChannel(channelId: string): Promise<CalendarConnectionRecord | null> {
    return prisma.calendarConnection.findFirst({ where: { channelId }, select: calendarConnectionSelect });
  }

  /** Every connection still syncing, across businesses, for the periodic sweep. */
  public listActiveConnectionIds(): Promise<CalendarSyncJobData[]> {
    return prisma.$queryRaw<CalendarSyncJobData[]>`
      SELECT "id" AS "connectionId", "business_id" AS "businessId"
      FROM "calendar_connections"
      WHERE "status" = 'ACTIVE'
    `;
  }

  /** Connects the staff member's calendar, replacing any earlier connection and its busy times. */
  public saveConnection(data: SaveCalendarConnectionData): Promise<CalendarConnectionRecord> {
    return prisma.$transaction(async (transaction) => {
      await transaction.calendarConnection.deleteMany({ where: { businessId: data.businessId, staffId: data.staffId } });

      return transaction.calendarConnection.create({ data, select: calendarConnectionSelect });
    });
  }

  public async deleteConnection(businessId: string, connectionId: string): Promise<void> {
    await prisma.calendarConnection.deleteMany({ where: { businessId, id: connectionId } });
  }

  public async saveTokens(
    businessId: string,
    connectionId: string,
    tokens: { accessTokenEncrypted: string; accessTokenExpiresAt: Date; refreshTokenEncrypted?: string },
  ): Promise<void> {
    await prisma.calendarConnection.updateMany({ where: { businessId, id: connectionId }, data: tokens });
  }

  public async saveWatch(businessId: string, connectionId: string, watch: CalendarWatchData): Promise<void> {
    await prisma.calendarConnection.updateMany({ where: { businessId, id: connectionId }, data: watch });
  }

  public async markNeedsReconnect(businessId: string, connectionId: string, error: string): Promise<void> {
    await prisma.calendarConnection.updateMany({
      where: { businessId, id: connectionId },
      data: { status: "NEEDS_RECONNECT", lastError: error },
    });
  }

  public async recordSync(businessId: string, connectionId: string, at: Date, error: string | null): Promise<void> {
    await prisma.calendarConnection.updateMany({
      where: { businessId, id: connectionId },
      data: { lastError: error, ...(error ? {} : { lastSyncedAt: at }) },
    });
  }

  /** Replaces the connection's busy times in one transaction. */
  public async replaceBusy(
    connection: CalendarConnectionRecord,
    intervals: BusyInterval[],
    busyHash: string,
  ): Promise<void> {
    await prisma.$transaction(async (transaction) => {
      await transaction.externalBusy.deleteMany({ where: { businessId: connection.businessId, connectionId: connection.id } });

      if (intervals.length > 0) {
        await transaction.externalBusy.createMany({
          data: intervals.map((interval) => ({
            businessId: connection.businessId,
            staffId: connection.staffId,
            connectionId: connection.id,
            startsAt: interval.startsAt,
            endsAt: interval.endsAt,
          })),
        });
      }

      await transaction.calendarConnection.updateMany({
        where: { businessId: connection.businessId, id: connection.id },
        data: { busyHash },
      });
    });
  }

  /** Event ids BookWise wrote to this calendar, so they are not read back as busy time. */
  public async listEventIds(businessId: string, connectionId: string): Promise<string[]> {
    const bookings = await prisma.booking.findMany({
      where: { businessId, calendarConnectionId: connectionId, calendarEventId: { not: null } },
      select: { calendarEventId: true },
    });

    return bookings.flatMap((booking) => (booking.calendarEventId ? [booking.calendarEventId] : []));
  }

  public findBookingForCalendar(businessId: string, bookingId: string): Promise<BookingCalendarRecord | null> {
    return prisma.booking.findFirst({
      where: { businessId, id: bookingId },
      select: {
        id: true,
        businessId: true,
        staffId: true,
        status: true,
        scheduledAt: true,
        endsAt: true,
        serviceName: true,
        notes: true,
        calendarEventId: true,
        calendarConnectionId: true,
        customer: { select: { name: true, email: true, phone: true } },
        service: { select: { location: { select: { name: true, address: true } } } },
        business: {
          select: {
            name: true,
            locations: {
              where: { isActive: true },
              orderBy: { createdAt: "asc" },
              take: 1,
              select: { name: true, address: true },
            },
          },
        },
      },
    });
  }

  /** Upcoming bookings of this staff member that are not yet in this calendar. */
  public async listBookingsToWrite(
    connection: CalendarConnectionRecord,
    now: Date,
    take: number,
  ): Promise<string[]> {
    const bookings = await prisma.booking.findMany({
      where: {
        businessId: connection.businessId,
        staffId: connection.staffId,
        status: { in: [...EVENT_STATUSES] },
        scheduledAt: { gte: now },
        OR: [{ calendarConnectionId: null }, { calendarConnectionId: { not: connection.id } }],
      },
      orderBy: { scheduledAt: "asc" },
      take,
      select: { id: true },
    });

    return bookings.map((booking) => booking.id);
  }

  public async setBookingEvent(
    businessId: string,
    bookingId: string,
    connectionId: string | null,
    eventId: string | null,
  ): Promise<void> {
    await prisma.booking.updateMany({
      where: { businessId, id: bookingId },
      data: { calendarConnectionId: connectionId, calendarEventId: eventId },
    });
  }
}

export const calendarDal = new CalendarDal();

export const CALENDAR_EVENT_STATUSES: ReadonlySet<string> = new Set(EVENT_STATUSES);
