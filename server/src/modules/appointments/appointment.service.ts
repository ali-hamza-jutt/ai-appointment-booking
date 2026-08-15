import {
  APPOINTMENT_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  VALIDATION_MESSAGES,
  VALIDATION_PATTERNS,
} from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import {
  isRecordNotFoundError,
  isUniqueConstraintError,
} from "../../utils/database.js";
import {
  decodeTimestampCursor,
  encodeTimestampCursor,
} from "../../utils/pagination.js";
import { normalizeWhitespace } from "../../utils/text.js";
import {
  localDateTimeToUtc,
  normalizeIanaTimeZone,
} from "../../utils/time-zone.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { AppointmentSlotConflictError } from "./appointment-slot-conflict.error.js";
import { appointmentDal } from "./dal/appointment.dal.js";
import type {
  AppointmentListResponse,
  AppointmentRecord,
  AppointmentResponse,
  AppointmentSource,
  CreateAppointmentRequest,
  ListAppointmentsOptions,
  PreparedAppointment,
  RescheduleAppointmentRequest,
} from "./dto/appointment.dto.js";

export class AppointmentService {
  public async createAppointment(
    userId: string,
    request: CreateAppointmentRequest,
    source: AppointmentSource = "FORM",
  ): Promise<AppointmentResponse> {
    const preparedAppointment = this.prepareAppointment(request);

    try {
      const appointment = await appointmentDal.createAppointment({
        userId,
        ...preparedAppointment,
        source,
      });

      return this.toResponse(appointment);
    } catch (error) {
      if (
        error instanceof AppointmentSlotConflictError ||
        isUniqueConstraintError(error)
      ) {
        throw new AppError(
          409,
          ERROR_CODES.APPOINTMENT_SLOT_UNAVAILABLE,
          ERROR_MESSAGES.APPOINTMENT_SLOT_UNAVAILABLE,
        );
      }

      throw error;
    }
  }

  public prepareAppointment(
    request: CreateAppointmentRequest,
  ): PreparedAppointment {
    const serviceName = normalizeWhitespace(request.serviceName);
    const scheduledAt = request.scheduledAt;
    const timeZone = normalizeIanaTimeZone(request.timeZone);
    const durationMinutes =
      request.durationMinutes ?? APPOINTMENT_CONSTANTS.DEFAULT_DURATION_MINUTES;
    const notes = request.notes?.trim() || null;

    this.validateServiceName(serviceName);
    this.validateScheduledAt(scheduledAt);
    this.validateTimeZone(timeZone);
    this.validateDuration(durationMinutes);
    this.validateNotes(notes);

    return {
      serviceName,
      scheduledAt,
      timeZone,
      durationMinutes,
      notes,
    };
  }

  public async cancelAppointment(
    userId: string,
    appointmentId: string,
  ): Promise<AppointmentResponse> {
    this.validateAppointmentId(appointmentId);

    try {
      const appointment = await appointmentDal.cancelAppointment({
        appointmentId,
        userId,
      });

      return this.toResponse(appointment);
    } catch (error) {
      if (!isRecordNotFoundError(error)) throw error;

      const currentAppointment = await appointmentDal.findAppointmentForUser(
        appointmentId,
        userId,
      );

      if (!currentAppointment) this.throwAppointmentNotFound();

      if (currentAppointment.status === "CANCELLED") {
        return this.toResponse(currentAppointment);
      }

      throw new AppError(
        409,
        ERROR_CODES.APPOINTMENT_CANCELLATION_NOT_ALLOWED,
        ERROR_MESSAGES.APPOINTMENT_CANCELLATION_NOT_ALLOWED,
      );
    }
  }

  public async rescheduleAppointment(
    userId: string,
    appointmentId: string,
    request: RescheduleAppointmentRequest,
  ): Promise<AppointmentResponse> {
    this.validateAppointmentId(appointmentId);

    const currentAppointment = await appointmentDal.findAppointmentForUser(
      appointmentId,
      userId,
    );

    if (!currentAppointment) this.throwAppointmentNotFound();

    if (
      currentAppointment.status === "CANCELLED" ||
      currentAppointment.status === "COMPLETED"
    ) {
      this.throwRescheduleNotAllowed();
    }

    const scheduledAt = localDateTimeToUtc(
      request.scheduledDate,
      request.scheduledTime,
      currentAppointment.timeZone,
    );

    if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
      throwRequestValidationError(
        "scheduledDate",
        VALIDATION_MESSAGES.APPOINTMENT_RESCHEDULE_TIME,
      );
    }

    try {
      const appointment = await appointmentDal.rescheduleAppointment({
        appointmentId,
        userId,
        scheduledAt,
        durationMinutes: currentAppointment.durationMinutes,
      });

      return this.toResponse(appointment);
    } catch (error) {
      if (
        error instanceof AppointmentSlotConflictError ||
        isUniqueConstraintError(error)
      ) {
        throw new AppError(
          409,
          ERROR_CODES.APPOINTMENT_SLOT_UNAVAILABLE,
          ERROR_MESSAGES.APPOINTMENT_SLOT_UNAVAILABLE,
        );
      }

      if (isRecordNotFoundError(error)) {
        const latestAppointment = await appointmentDal.findAppointmentForUser(
          appointmentId,
          userId,
        );

        if (!latestAppointment) this.throwAppointmentNotFound();
        this.throwRescheduleNotAllowed();
      }

      throw error;
    }
  }

  public async getAppointment(
    userId: string,
    appointmentId: string,
  ): Promise<AppointmentResponse> {
    this.validateAppointmentId(appointmentId);

    const appointment = await appointmentDal.findAppointmentForUser(
      appointmentId,
      userId,
    );

    if (!appointment) {
      this.throwAppointmentNotFound();
    }

    return this.toResponse(appointment);
  }

  public async listAppointments(
    userId: string,
    options: ListAppointmentsOptions,
  ): Promise<AppointmentListResponse> {
    const limit = options.limit ?? APPOINTMENT_CONSTANTS.DEFAULT_PAGE_SIZE;
    this.validateLimit(limit);

    const decodedCursor = options.cursor
      ? decodeTimestampCursor(options.cursor)
      : undefined;

    if (options.cursor && !decodedCursor) {
      throw new AppError(
        422,
        ERROR_CODES.INVALID_PAGINATION_CURSOR,
        ERROR_MESSAGES.INVALID_PAGINATION_CURSOR,
        { cursor: [ERROR_MESSAGES.INVALID_PAGINATION_CURSOR] },
      );
    }

    const cursor = decodedCursor
      ? {
          createdAt: decodedCursor.timestamp,
          id: decodedCursor.id,
        }
      : undefined;
    const records = await appointmentDal.listAppointments({
      userId,
      ...(options.status ? { status: options.status } : {}),
      ...(cursor ? { cursor } : {}),
      take: limit + 1,
    });
    const hasMore = records.length > limit;
    const page = hasMore ? records.slice(0, limit) : records;
    const lastRecord = page.at(-1);

    return {
      items: page.map((appointment) => this.toResponse(appointment)),
      ...(hasMore && lastRecord
        ? {
            nextCursor: encodeTimestampCursor(
              lastRecord.id,
              lastRecord.createdAt,
            ),
          }
        : {}),
    };
  }

  private validateServiceName(serviceName: string): void {
    if (
      serviceName.length < APPOINTMENT_CONSTANTS.MIN_SERVICE_NAME_LENGTH ||
      serviceName.length > APPOINTMENT_CONSTANTS.MAX_SERVICE_NAME_LENGTH
    ) {
      throwRequestValidationError(
        "serviceName",
        VALIDATION_MESSAGES.APPOINTMENT_SERVICE_NAME,
      );
    }
  }

  private validateAppointmentId(appointmentId: string): void {
    if (!VALIDATION_PATTERNS.UUID.test(appointmentId)) {
      throwRequestValidationError(
        "appointmentId",
        VALIDATION_MESSAGES.APPOINTMENT_ID,
      );
    }
  }

  private validateTimeZone(timeZone: string | null): asserts timeZone is string {
    if (!timeZone) {
      throwRequestValidationError(
        "timeZone",
        VALIDATION_MESSAGES.APPOINTMENT_TIME_ZONE,
      );
    }
  }

  private throwAppointmentNotFound(): never {
    throw new AppError(
      404,
      ERROR_CODES.APPOINTMENT_NOT_FOUND,
      ERROR_MESSAGES.APPOINTMENT_NOT_FOUND,
    );
  }

  private throwRescheduleNotAllowed(): never {
    throw new AppError(
      409,
      ERROR_CODES.APPOINTMENT_RESCHEDULE_NOT_ALLOWED,
      ERROR_MESSAGES.APPOINTMENT_RESCHEDULE_NOT_ALLOWED,
    );
  }

  private validateScheduledAt(scheduledAt: Date): void {
    if (
      !(scheduledAt instanceof Date) ||
      Number.isNaN(scheduledAt.getTime()) ||
      scheduledAt.getTime() <= Date.now()
    ) {
      throwRequestValidationError(
        "scheduledAt",
        VALIDATION_MESSAGES.APPOINTMENT_TIME,
      );
    }
  }

  private validateDuration(durationMinutes: number): void {
    if (
      !Number.isInteger(durationMinutes) ||
      durationMinutes < APPOINTMENT_CONSTANTS.MIN_DURATION_MINUTES ||
      durationMinutes > APPOINTMENT_CONSTANTS.MAX_DURATION_MINUTES
    ) {
      throwRequestValidationError(
        "durationMinutes",
        VALIDATION_MESSAGES.APPOINTMENT_DURATION,
      );
    }
  }

  private validateNotes(notes: string | null): void {
    if (
      notes !== null &&
      notes.length > APPOINTMENT_CONSTANTS.MAX_NOTES_LENGTH
    ) {
      throwRequestValidationError(
        "notes",
        VALIDATION_MESSAGES.APPOINTMENT_NOTES,
      );
    }
  }

  private validateLimit(limit: number): void {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > APPOINTMENT_CONSTANTS.MAX_PAGE_SIZE
    ) {
      throwRequestValidationError("limit", VALIDATION_MESSAGES.PAGINATION_LIMIT);
    }
  }

  public toResponse(appointment: AppointmentRecord): AppointmentResponse {
    return {
      id: appointment.id,
      serviceName: appointment.serviceName,
      scheduledAt: appointment.scheduledAt,
      timeZone: appointment.timeZone,
      durationMinutes: appointment.durationMinutes,
      status: appointment.status,
      source: appointment.source,
      notes: appointment.notes,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt,
    };
  }
}

export const appointmentService = new AppointmentService();
