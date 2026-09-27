import { BOOKING_CONSTANTS } from "../../../constants/app.constants.js";
import {
  prisma,
  type DbClient,
} from "../../../infrastructure/database/prisma.js";
import type {
  AvailabilityServiceRecord,
  BookingLoadRecord,
  ResourceLoadRecord,
  AvailabilityStaffRecord,
  ClosureResponse,
  TimeOffResponse,
  WorkingHoursRecord,
  WorkingHoursWriteData,
} from "../dto/availability.dto.js";

const workingHoursSelect = {
  id: true,
  weekday: true,
  startMinute: true,
  endMinute: true,
  location: { select: { id: true, name: true } },
} as const;

const timeOffSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  reason: true,
} as const;

export class AvailabilityDal {
  public listWorkingHours(businessId: string, staffId: string): Promise<WorkingHoursRecord[]> {
    return prisma.workingHours.findMany({
      where: { businessId, staffId },
      orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
      select: workingHoursSelect,
    });
  }

  public replaceWorkingHours(
    businessId: string,
    staffId: string,
    rows: WorkingHoursWriteData[],
  ): Promise<WorkingHoursRecord[]> {
    return prisma.$transaction(async (transaction) => {
      await transaction.workingHours.deleteMany({ where: { businessId, staffId } });
      await transaction.workingHours.createMany({
        data: rows.map((row) => ({ ...row, businessId, staffId })),
      });

      return transaction.workingHours.findMany({
        where: { businessId, staffId },
        orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
        select: workingHoursSelect,
      });
    });
  }

  public async staffExists(businessId: string, staffId: string): Promise<boolean> {
    return (await prisma.staff.count({ where: { id: staffId, businessId } })) > 0;
  }

  public countLocations(businessId: string, locationIds: string[]): Promise<number> {
    return prisma.location.count({ where: { businessId, id: { in: locationIds } } });
  }

  public listTimeOff(
    businessId: string,
    staffId: string,
    from: Date,
  ): Promise<TimeOffResponse[]> {
    return prisma.timeOff.findMany({
      where: { businessId, staffId, endsAt: { gt: from } },
      orderBy: { startsAt: "asc" },
      select: timeOffSelect,
    });
  }

  public createTimeOff(
    businessId: string,
    staffId: string,
    data: { startsAt: Date; endsAt: Date; reason: string | null },
  ): Promise<TimeOffResponse> {
    return prisma.timeOff.create({
      data: { businessId, staffId, ...data },
      select: timeOffSelect,
    });
  }

  public async deleteTimeOff(
    businessId: string,
    staffId: string,
    timeOffId: string,
  ): Promise<void> {
    await prisma.timeOff.delete({ where: { id: timeOffId, businessId, staffId } });
  }

  public async listClosures(businessId: string, fromDate: Date): Promise<ClosureResponse[]> {
    const closures = await prisma.businessClosure.findMany({
      where: { businessId, date: { gte: fromDate } },
      orderBy: { date: "asc" },
      select: { id: true, date: true, reason: true },
    });

    return closures.map((closure) => ({
      ...closure,
      date: closure.date.toISOString().slice(0, 10),
    }));
  }

  public async createClosure(
    businessId: string,
    date: Date,
    reason: string | null,
  ): Promise<ClosureResponse> {
    const closure = await prisma.businessClosure.create({
      data: { businessId, date, reason },
      select: { id: true, date: true, reason: true },
    });

    return { ...closure, date: closure.date.toISOString().slice(0, 10) };
  }

  public async deleteClosure(businessId: string, closureId: string): Promise<void> {
    await prisma.businessClosure.delete({ where: { id: closureId, businessId } });
  }

  public findBookableService(
    businessId: string,
    serviceId: string,
    client: DbClient = prisma,
  ): Promise<AvailabilityServiceRecord | null> {
    return client.service.findFirst({
      where: { id: serviceId, businessId, isActive: true },
      select: {
        id: true,
        name: true,
        priceMinor: true,
        currency: true,
        bookingType: true,
        capacity: true,
        durationMinutes: true,
        bufferBeforeMin: true,
        bufferAfterMin: true,
        locationId: true,
        onlineBookable: true,
        policyOverrides: true,
        providers: {
          select: { staffId: true, customDurationMinutes: true, customPriceMinor: true },
        },
        resources: {
          select: { resource: { select: { id: true, capacity: true, isActive: true } } },
        },
      },
    });
  }

  public listStaffSchedules(
    businessId: string,
    staffIds: string[],
    from: Date,
    to: Date,
    client: DbClient = prisma,
  ): Promise<AvailabilityStaffRecord[]> {
    return client.staff.findMany({
      where: { businessId, id: { in: staffIds }, isActive: true },
      select: {
        id: true,
        locations: { select: { locationId: true } },
        workingHours: {
          select: {
            weekday: true,
            startMinute: true,
            endMinute: true,
            locationId: true,
            location: { select: { timeZone: true } },
          },
        },
        timeOff: {
          where: { startsAt: { lt: to }, endsAt: { gt: from } },
          select: { startsAt: true, endsAt: true },
        },
        externalBusy: {
          where: { startsAt: { lt: to }, endsAt: { gt: from } },
          select: { startsAt: true, endsAt: true },
        },
      },
    });
  }

  public async listClosedDates(
    businessId: string,
    fromDate: Date,
    toDate: Date,
    client: DbClient = prisma,
  ): Promise<string[]> {
    const closures = await client.businessClosure.findMany({
      where: { businessId, date: { gte: fromDate, lte: toDate } },
      select: { date: true },
    });

    return closures.map((closure) => closure.date.toISOString().slice(0, 10));
  }

  /**
   * Bookings that occupy these providers in the range. Holds count until they
   * expire, judged against the same `now` the slots are computed with.
   */
  public listBookingLoad(
    businessId: string,
    staffIds: string[],
    from: Date,
    to: Date,
    now: Date,
    excludeBookingId: string | undefined,
    client: DbClient = prisma,
  ): Promise<BookingLoadRecord[]> {
    return client.booking.findMany({
      where: {
        businessId,
        staffId: { in: staffIds },
        status: { in: [...BOOKING_CONSTANTS.ACTIVE_STATUSES] },
        occupiedFrom: { lt: to },
        occupiedUntil: { gt: from },
        NOT: [
          { status: "HELD", holdExpiresAt: { lte: now } },
          ...(excludeBookingId ? [{ id: excludeBookingId }] : []),
        ],
      },
      select: {
        id: true,
        staffId: true,
        serviceId: true,
        sessionKey: true,
        seats: true,
        scheduledAt: true,
        endsAt: true,
        occupiedFrom: true,
        occupiedUntil: true,
      },
    });
  }

  /** Bookings using any of these resources, one entry per session. */
  public async listResourceLoad(
    businessId: string,
    resourceIds: string[],
    from: Date,
    to: Date,
    now: Date,
    excludeBookingId: string | undefined,
    client: DbClient = prisma,
  ): Promise<ResourceLoadRecord[]> {
    const bookings = await client.booking.findMany({
      where: {
        businessId,
        status: { in: [...BOOKING_CONSTANTS.ACTIVE_STATUSES] },
        occupiedFrom: { lt: to },
        occupiedUntil: { gt: from },
        service: { resources: { some: { resourceId: { in: resourceIds } } } },
        NOT: [
          { status: "HELD", holdExpiresAt: { lte: now } },
          ...(excludeBookingId ? [{ id: excludeBookingId }] : []),
        ],
      },
      distinct: ["sessionKey"],
      select: {
        sessionKey: true,
        occupiedFrom: true,
        occupiedUntil: true,
        service: {
          select: {
            resources: {
              where: { resourceId: { in: resourceIds } },
              select: { resourceId: true },
            },
          },
        },
      },
    });

    return bookings.map((booking) => ({
      sessionKey: booking.sessionKey,
      occupiedFrom: booking.occupiedFrom,
      occupiedUntil: booking.occupiedUntil,
      resourceIds: booking.service?.resources.map((resource) => resource.resourceId) ?? [],
    }));
  }
}

export const availabilityDal = new AvailabilityDal();
