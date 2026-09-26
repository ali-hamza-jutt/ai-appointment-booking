import {
  AVAILABILITY_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  VALIDATION_MESSAGES,
} from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import {
  isRecordNotFoundError,
  isUniqueConstraintError,
} from "../../utils/database.js";
import { assertUuid } from "../../utils/identifiers.js";
import {
  addDaysToLocalDate,
  getLocalDateTimeValues,
  isValidLocalDate,
  localTimeToMinutes,
  minutesToLocalTime,
  normalizeIanaTimeZone,
  wallClockToUtc,
} from "../../utils/time-zone.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import {
  prisma,
  type DbClient,
} from "../../infrastructure/database/prisma.js";
import { resolveBookingPolicy } from "../bookings/booking-policy.js";
import { businessService } from "../businesses/business.service.js";
import { availabilityCache } from "./availability-cache.js";
import { availabilityDal } from "./dal/availability.dal.js";
import type {
  AvailabilityDay,
  AvailabilityQuery,
  AvailabilityResponse,
  AvailabilityServiceRecord,
  BookingLoadRecord,
  ClosureListResponse,
  ClosureResponse,
  CreateClosureRequest,
  CreateTimeOffRequest,
  ReplaceWorkingHoursRequest,
  TimeOffListResponse,
  TimeOffResponse,
  WorkingHoursListResponse,
  WorkingHoursRecord,
  WorkingHoursWriteData,
} from "./dto/availability.dto.js";
import {
  generateSlots,
  type ClassSession,
  type GeneratedSlot,
  type ProviderSchedule,
  type WeeklyRule,
} from "./slot-generator.js";

const MILLISECONDS_PER_DAY = 86_400_000;
const STAFF_BOOKING_WINDOW_DAYS = 3_650;

export type AvailabilityMode = "CUSTOMER" | "STAFF";

export interface SlotBusiness {
  id: string;
  timeZone: string;
  settings: unknown;
}

/** Groups bookings of one class into sessions with their seat counts. */
function toClassSessions(bookings: BookingLoadRecord[]): ClassSession[] {
  const sessions = new Map<string, ClassSession>();

  for (const booking of bookings) {
    const session = sessions.get(booking.sessionKey);

    if (session) {
      session.seatsTaken += booking.seats;
    } else {
      sessions.set(booking.sessionKey, {
        startsAt: booking.scheduledAt,
        endsAt: booking.endsAt,
        blocked: { startsAt: booking.occupiedFrom, endsAt: booking.occupiedUntil },
        seatsTaken: booking.seats,
      });
    }
  }

  return [...sessions.values()];
}

export class AvailabilityService {
  public async listWorkingHours(
    businessId: string,
    staffId: string,
  ): Promise<WorkingHoursListResponse> {
    await this.assertStaff(businessId, staffId);

    const rows = await availabilityDal.listWorkingHours(businessId, staffId);

    return { staffId, items: rows.map((row) => this.toWorkingHoursResponse(row)) };
  }

  public async replaceWorkingHours(
    businessId: string,
    staffId: string,
    request: ReplaceWorkingHoursRequest,
  ): Promise<WorkingHoursListResponse> {
    await this.assertStaff(businessId, staffId);

    if (request.items.length > AVAILABILITY_CONSTANTS.MAX_WORKING_HOURS_ROWS) {
      throwRequestValidationError("items", VALIDATION_MESSAGES.WORKING_HOURS_TIME);
    }

    const rows = request.items.map<WorkingHoursWriteData>((item, index) => {
      const startMinute = localTimeToMinutes(item.startTime);
      const endOfDay = localTimeToMinutes(item.endTime);

      if (!Number.isInteger(item.weekday) || item.weekday < 1 || item.weekday > 7) {
        throwRequestValidationError(
          `items.${index}.weekday`,
          VALIDATION_MESSAGES.WORKING_HOURS_WEEKDAY,
        );
      }

      if (startMinute === null || endOfDay === null) {
        throwRequestValidationError(
          `items.${index}.startTime`,
          VALIDATION_MESSAGES.WORKING_HOURS_TIME,
        );
      }

      return {
        weekday: item.weekday,
        startMinute,
        endMinute:
          endOfDay > startMinute
            ? endOfDay
            : endOfDay + AVAILABILITY_CONSTANTS.MINUTES_PER_DAY,
        locationId: item.locationId ?? null,
      };
    });

    this.assertNoOverlap(rows);

    const locationIds = [
      ...new Set(rows.flatMap((row) => (row.locationId ? [row.locationId] : []))),
    ];

    locationIds.forEach((locationId) => assertUuid("locationId", locationId));

    if (
      locationIds.length > 0 &&
      (await availabilityDal.countLocations(businessId, locationIds)) !== locationIds.length
    ) {
      throwRequestValidationError("locationId", VALIDATION_MESSAGES.UNKNOWN_REFERENCES);
    }

    const saved = await availabilityDal.replaceWorkingHours(businessId, staffId, rows);

    return { staffId, items: saved.map((row) => this.toWorkingHoursResponse(row)) };
  }

  public async listTimeOff(businessId: string, staffId: string): Promise<TimeOffListResponse> {
    await this.assertStaff(businessId, staffId);

    return { items: await availabilityDal.listTimeOff(businessId, staffId, new Date()) };
  }

  public async createTimeOff(
    businessId: string,
    staffId: string,
    request: CreateTimeOffRequest,
  ): Promise<TimeOffResponse> {
    await this.assertStaff(businessId, staffId);

    const durationMs = request.endsAt.getTime() - request.startsAt.getTime();

    if (
      Number.isNaN(durationMs) ||
      durationMs <= 0 ||
      durationMs > AVAILABILITY_CONSTANTS.MAX_TIME_OFF_DAYS * MILLISECONDS_PER_DAY
    ) {
      throwRequestValidationError("endsAt", VALIDATION_MESSAGES.TIME_OFF_RANGE);
    }

    return availabilityDal.createTimeOff(businessId, staffId, {
      startsAt: request.startsAt,
      endsAt: request.endsAt,
      reason: this.normalizeReason(request.reason),
    });
  }

  public async deleteTimeOff(
    businessId: string,
    staffId: string,
    timeOffId: string,
  ): Promise<void> {
    assertUuid("staffId", staffId);
    assertUuid("timeOffId", timeOffId);

    try {
      await availabilityDal.deleteTimeOff(businessId, staffId, timeOffId);
    } catch (error) {
      if (!isRecordNotFoundError(error)) throw error;

      throw new AppError(
        404,
        ERROR_CODES.TIME_OFF_NOT_FOUND,
        ERROR_MESSAGES.TIME_OFF_NOT_FOUND,
      );
    }
  }

  public async listClosures(businessId: string): Promise<ClosureListResponse> {
    const business = await businessService.getBusiness(businessId, null);
    const today = getLocalDateTimeValues(new Date(), business.timeZone)?.date;

    return {
      items: await availabilityDal.listClosures(
        businessId,
        new Date(`${today ?? "1970-01-01"}T00:00:00Z`),
      ),
    };
  }

  public async createClosure(
    businessId: string,
    request: CreateClosureRequest,
  ): Promise<ClosureResponse> {
    if (!isValidLocalDate(request.date)) {
      throwRequestValidationError("date", VALIDATION_MESSAGES.CLOSURE_DATE);
    }

    try {
      return await availabilityDal.createClosure(
        businessId,
        new Date(`${request.date}T00:00:00Z`),
        this.normalizeReason(request.reason),
      );
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;

      throw new AppError(
        409,
        ERROR_CODES.CLOSURE_ALREADY_EXISTS,
        ERROR_MESSAGES.CLOSURE_ALREADY_EXISTS,
        { date: [ERROR_MESSAGES.CLOSURE_ALREADY_EXISTS] },
      );
    }
  }

  public async deleteClosure(businessId: string, closureId: string): Promise<void> {
    assertUuid("closureId", closureId);

    try {
      await availabilityDal.deleteClosure(businessId, closureId);
    } catch (error) {
      if (!isRecordNotFoundError(error)) throw error;

      throw new AppError(404, ERROR_CODES.CLOSURE_NOT_FOUND, ERROR_MESSAGES.CLOSURE_NOT_FOUND);
    }
  }

  /** Bookable start times for a service behind a public booking link. */
  public async getPublicAvailability(
    slug: string,
    query: AvailabilityQuery,
  ): Promise<AvailabilityResponse> {
    const business = await businessService.getPublicBusiness(slug);

    assertUuid("serviceId", query.serviceId);

    const service = await availabilityDal.findBookableService(business.id, query.serviceId);

    if (!service?.onlineBookable) this.throwServiceNotFound();

    return availabilityCache.getOrCompute(
      business.id,
      { ...query, mode: "CUSTOMER" },
      () => this.respondWithSlots(business, service, query, "CUSTOMER"),
    );
  }

  /**
   * Open times for staff taking a booking: ignores minimum notice, the
   * booking window and the online-bookable flag, but never double books.
   */
  public async getBusinessAvailability(
    businessId: string,
    query: AvailabilityQuery,
  ): Promise<AvailabilityResponse> {
    const business = await businessService.getBusiness(businessId, null);

    assertUuid("serviceId", query.serviceId);

    const service = await availabilityDal.findBookableService(businessId, query.serviceId);

    if (!service) this.throwServiceNotFound();

    return this.respondWithSlots(business, service, query, "STAFF");
  }

  /**
   * The slot starting exactly at `startsAt`, recomputed from the database
   * (use a transaction client after locking the provider). Null if taken.
   */
  public async findSlot(input: {
    client: DbClient;
    business: SlotBusiness;
    service: AvailabilityServiceRecord;
    staffId?: string;
    startsAt: Date;
    mode: AvailabilityMode;
    excludeBookingId?: string;
    now?: Date;
  }): Promise<GeneratedSlot | null> {
    const slots = await this.computeSlots({
      client: input.client,
      business: input.business,
      service: input.service,
      mode: input.mode,
      from: input.startsAt,
      to: new Date(input.startsAt.getTime() + 1),
      now: input.now ?? new Date(),
      ...(input.staffId ? { staffId: input.staffId } : {}),
      ...(input.excludeBookingId ? { excludeBookingId: input.excludeBookingId } : {}),
    });

    return slots.find((slot) => slot.startsAt.getTime() === input.startsAt.getTime()) ?? null;
  }

  /** Up to `count` open start times on or after `from`, for suggesting alternatives. */
  public async findNextSlots(input: {
    business: SlotBusiness;
    service: AvailabilityServiceRecord;
    from: Date;
    count: number;
  }): Promise<GeneratedSlot[]> {
    const slots = await this.computeSlots({
      client: prisma,
      business: input.business,
      service: input.service,
      mode: "CUSTOMER",
      from: input.from,
      to: new Date(input.from.getTime() + AVAILABILITY_CONSTANTS.MAX_RANGE_DAYS * MILLISECONDS_PER_DAY),
      now: new Date(),
    });

    return slots.slice(0, input.count);
  }

  private async respondWithSlots(
    business: SlotBusiness,
    service: AvailabilityServiceRecord,
    query: AvailabilityQuery,
    mode: AvailabilityMode,
  ): Promise<AvailabilityResponse> {
    const displayTimeZone = query.timeZone
      ? normalizeIanaTimeZone(query.timeZone)
      : business.timeZone;

    if (!displayTimeZone) {
      throwRequestValidationError("timeZone", VALIDATION_MESSAGES.BUSINESS_TIME_ZONE);
    }

    const range = this.resolveRange(query.from, query.to, displayTimeZone);

    if (query.staffId) assertUuid("staffId", query.staffId);

    const slots = await this.computeSlots({
      client: prisma,
      business,
      service,
      mode,
      from: range.from,
      to: range.to,
      now: new Date(),
      ...(query.staffId ? { staffId: query.staffId } : {}),
    });

    return {
      serviceId: service.id,
      timeZone: displayTimeZone,
      days: this.groupByLocalDate(slots, displayTimeZone),
    };
  }

  private async computeSlots(input: {
    client: DbClient;
    business: SlotBusiness;
    service: AvailabilityServiceRecord;
    mode: AvailabilityMode;
    staffId?: string;
    from: Date;
    to: Date;
    now: Date;
    excludeBookingId?: string;
  }): Promise<GeneratedSlot[]> {
    const { business, client, service } = input;
    const providerDurations = new Map(
      service.providers
        .filter((provider) => !input.staffId || provider.staffId === input.staffId)
        .map((provider) => [
          provider.staffId,
          provider.customDurationMinutes ?? service.durationMinutes,
        ]),
    );

    if (providerDurations.size === 0) return [];

    const policy = resolveBookingPolicy(business.settings, service.policyOverrides);
    const staffIds = [...providerDurations.keys()];
    const activeResources = service.resources
      .map(({ resource }) => resource)
      .filter((resource) => resource.isActive);
    // Load a day either side so buffers and overnight shifts at the edges count.
    const loadFrom = new Date(input.from.getTime() - MILLISECONDS_PER_DAY);
    const loadTo = new Date(input.to.getTime() + MILLISECONDS_PER_DAY);
    const [staff, closedDates, bookingLoad, resourceLoad] = await Promise.all([
      availabilityDal.listStaffSchedules(business.id, staffIds, loadFrom, loadTo, client),
      availabilityDal.listClosedDates(business.id, loadFrom, loadTo, client),
      availabilityDal.listBookingLoad(
        business.id,
        staffIds,
        loadFrom,
        loadTo,
        input.now,
        input.excludeBookingId,
        client,
      ),
      activeResources.length > 0
        ? availabilityDal.listResourceLoad(
            business.id,
            activeResources.map((resource) => resource.id),
            loadFrom,
            loadTo,
            input.now,
            input.excludeBookingId,
            client,
          )
        : Promise.resolve([]),
    ]);
    const isClass = service.bookingType === "CLASS";

    const providers = staff
      .filter(
        (member) =>
          !service.locationId ||
          member.locations.length === 0 ||
          member.locations.some((location) => location.locationId === service.locationId),
      )
      .map<ProviderSchedule>((member) => {
        const load = bookingLoad.filter((booking) => booking.staffId === member.id);
        const sessionLoad = isClass
          ? load.filter((booking) => booking.serviceId === service.id)
          : [];

        return {
          staffId: member.id,
          durationMinutes: providerDurations.get(member.id) ?? service.durationMinutes,
          weeklyRules: member.workingHours
            .filter(
              (rule) =>
                !service.locationId ||
                !rule.locationId ||
                rule.locationId === service.locationId,
            )
            .map<WeeklyRule>((rule) => ({
              weekday: rule.weekday,
              startMinute: rule.startMinute,
              endMinute: rule.endMinute,
              timeZone: rule.location?.timeZone ?? business.timeZone,
            })),
          timeOff: member.timeOff,
          busy: load
            .filter((booking) => !sessionLoad.includes(booking))
            .map((booking) => ({
              startsAt: booking.occupiedFrom,
              endsAt: booking.occupiedUntil,
            })),
          classSessions: toClassSessions(sessionLoad),
        };
      });

    return generateSlots({
      from: input.from,
      to: input.to,
      now: input.now,
      closedDates: new Set(closedDates),
      service: {
        bookingType: service.bookingType,
        capacity: service.capacity,
        bufferBeforeMin: service.bufferBeforeMin,
        bufferAfterMin: service.bufferAfterMin,
      },
      policy: {
        slotStepMinutes: policy.slotStepMinutes,
        minimumNoticeMinutes: input.mode === "STAFF" ? 0 : policy.minimumNoticeMinutes,
        bookingWindowDays:
          input.mode === "STAFF" ? STAFF_BOOKING_WINDOW_DAYS : policy.bookingWindowDays,
      },
      providers,
      resources: activeResources.map((resource) => ({
        resourceId: resource.id,
        capacity: resource.capacity,
        busy: resourceLoad
          .filter((load) => load.resourceIds.includes(resource.id))
          .map((load) => ({ startsAt: load.occupiedFrom, endsAt: load.occupiedUntil })),
      })),
    });
  }

  private resolveRange(from: string, to: string, timeZone: string): { from: Date; to: Date } {
    if (!isValidLocalDate(from) || !isValidLocalDate(to) || to < from) {
      throwRequestValidationError("from", VALIDATION_MESSAGES.AVAILABILITY_RANGE);
    }

    const start = wallClockToUtc(from, 0, timeZone);
    const end = wallClockToUtc(addDaysToLocalDate(to, 1), 0, timeZone);

    if (
      end.getTime() - start.getTime() >
      AVAILABILITY_CONSTANTS.MAX_RANGE_DAYS * MILLISECONDS_PER_DAY + MILLISECONDS_PER_DAY / 12
    ) {
      throwRequestValidationError("to", VALIDATION_MESSAGES.AVAILABILITY_RANGE);
    }

    return { from: start, to: end };
  }

  private groupByLocalDate(
    slots: ReturnType<typeof generateSlots>,
    timeZone: string,
  ): AvailabilityDay[] {
    const days = new Map<string, AvailabilityDay>();

    for (const slot of slots) {
      const local = getLocalDateTimeValues(slot.startsAt, timeZone);

      if (!local) continue;

      const day = days.get(local.date) ?? { date: local.date, slots: [] };

      day.slots.push({
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        time: local.time,
        staffIds: slot.staffIds,
        seatsLeft: slot.seatsLeft,
      });
      days.set(local.date, day);
    }

    return [...days.values()];
  }

  /** Rejects shifts for one person that overlap anywhere in the week, including Sunday into Monday. */
  private assertNoOverlap(rows: WorkingHoursWriteData[]): void {
    const week = AVAILABILITY_CONSTANTS.MINUTES_PER_WEEK;
    const ranges = rows.map((row) => {
      const start = (row.weekday - 1) * AVAILABILITY_CONSTANTS.MINUTES_PER_DAY + row.startMinute;

      return { start, end: start + (row.endMinute - row.startMinute) };
    });

    for (let first = 0; first < ranges.length; first += 1) {
      for (let second = first + 1; second < ranges.length; second += 1) {
        const a = ranges[first]!;
        const b = ranges[second]!;
        const overlapsAt = (shift: number) =>
          a.start < b.end + shift && b.start + shift < a.end;

        if (overlapsAt(0) || overlapsAt(week) || overlapsAt(-week)) {
          throwRequestValidationError("items", VALIDATION_MESSAGES.WORKING_HOURS_OVERLAP);
        }
      }
    }
  }

  private async assertStaff(businessId: string, staffId: string): Promise<void> {
    assertUuid("staffId", staffId);

    if (!(await availabilityDal.staffExists(businessId, staffId))) {
      throw new AppError(404, ERROR_CODES.STAFF_NOT_FOUND, ERROR_MESSAGES.STAFF_NOT_FOUND);
    }
  }

  private normalizeReason(reason: string | undefined): string | null {
    const value = reason?.trim() ?? "";

    if (value.length > AVAILABILITY_CONSTANTS.MAX_REASON_LENGTH) {
      throwRequestValidationError("reason", VALIDATION_MESSAGES.REASON);
    }

    return value || null;
  }

  private toWorkingHoursResponse(row: WorkingHoursRecord) {
    return {
      id: row.id,
      weekday: row.weekday,
      startTime: minutesToLocalTime(row.startMinute),
      endTime: minutesToLocalTime(row.endMinute),
      endsNextDay: row.endMinute >= AVAILABILITY_CONSTANTS.MINUTES_PER_DAY,
      location: row.location,
    };
  }

  private throwServiceNotFound(): never {
    throw new AppError(404, ERROR_CODES.SERVICE_NOT_FOUND, ERROR_MESSAGES.SERVICE_NOT_FOUND);
  }
}

export const availabilityService = new AvailabilityService();
