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
import { parseStoredBusinessSettings } from "../businesses/business-settings.js";
import { businessService } from "../businesses/business.service.js";
import { availabilityDal } from "./dal/availability.dal.js";
import type {
  AvailabilityDay,
  AvailabilityQuery,
  AvailabilityResponse,
  AvailabilityServiceRecord,
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
  type ProviderSchedule,
  type WeeklyRule,
} from "./slot-generator.js";

const MILLISECONDS_PER_DAY = 86_400_000;

interface AvailabilityContext {
  business: { id: string; timeZone: string; settings: unknown };
  service: AvailabilityServiceRecord;
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

    return this.computeAvailability({ business, service }, query);
  }

  private async computeAvailability(
    context: AvailabilityContext,
    query: AvailabilityQuery,
  ): Promise<AvailabilityResponse> {
    const { business, service } = context;
    const displayTimeZone = query.timeZone
      ? normalizeIanaTimeZone(query.timeZone)
      : business.timeZone;

    if (!displayTimeZone) {
      throwRequestValidationError("timeZone", VALIDATION_MESSAGES.BUSINESS_TIME_ZONE);
    }

    const range = this.resolveRange(query.from, query.to, displayTimeZone);

    if (query.staffId) assertUuid("staffId", query.staffId);

    const providerDurations = new Map(
      service.providers
        .filter((provider) => !query.staffId || provider.staffId === query.staffId)
        .map((provider) => [
          provider.staffId,
          provider.customDurationMinutes ?? service.durationMinutes,
        ]),
    );
    const settings = parseStoredBusinessSettings(business.settings);
    const [staff, closedDates] = await Promise.all([
      providerDurations.size > 0
        ? availabilityDal.listStaffSchedules(
            business.id,
            [...providerDurations.keys()],
            range.from,
            range.to,
          )
        : Promise.resolve([]),
      availabilityDal.listClosedDates(
        business.id,
        new Date(range.from.getTime() - MILLISECONDS_PER_DAY),
        new Date(range.to.getTime() + MILLISECONDS_PER_DAY),
      ),
    ]);

    const providers = staff
      .filter(
        (member) =>
          !service.locationId ||
          member.locations.length === 0 ||
          member.locations.some((location) => location.locationId === service.locationId),
      )
      .map<ProviderSchedule>((member) => ({
        staffId: member.id,
        durationMinutes: providerDurations.get(member.id) ?? service.durationMinutes,
        weeklyRules: member.workingHours
          .filter(
            (rule) =>
              !service.locationId || !rule.locationId || rule.locationId === service.locationId,
          )
          .map<WeeklyRule>((rule) => ({
            weekday: rule.weekday,
            startMinute: rule.startMinute,
            endMinute: rule.endMinute,
            timeZone: rule.location?.timeZone ?? business.timeZone,
          })),
        timeOff: member.timeOff,
        busy: [],
        classSessions: [],
      }));

    const slots = generateSlots({
      from: range.from,
      to: range.to,
      now: new Date(),
      closedDates: new Set(closedDates),
      service: {
        bookingType: service.bookingType,
        capacity: service.capacity,
        bufferBeforeMin: service.bufferBeforeMin,
        bufferAfterMin: service.bufferAfterMin,
      },
      policy: {
        slotStepMinutes: settings.slotStepMinutes,
        minimumNoticeMinutes: settings.minimumNoticeMinutes,
        bookingWindowDays: settings.bookingWindowDays,
      },
      providers,
      resources: service.resources
        .filter(({ resource }) => resource.isActive)
        .map(({ resource }) => ({
          resourceId: resource.id,
          capacity: resource.capacity,
          busy: [],
        })),
    });

    return {
      serviceId: service.id,
      timeZone: displayTimeZone,
      days: this.groupByLocalDate(slots, displayTimeZone),
    };
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
