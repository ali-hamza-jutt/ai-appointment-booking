import {
  APPOINTMENT_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  VALIDATION_MESSAGES,
  VALIDATION_PATTERNS,
} from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import { isUniqueConstraintError } from "../../utils/database.js";
import {
  decodeTimestampCursor,
  encodeTimestampCursor,
} from "../../utils/pagination.js";
import { normalizeWhitespace } from "../../utils/text.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { appointmentDal } from "./dal/appointment.dal.js";
import type {
  AppointmentListResponse,
  AppointmentRecord,
  AppointmentResponse,
  AppointmentSource,
  CreateAppointmentRequest,
  ListAppointmentsOptions,
  PreparedAppointment,
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
      if (isUniqueConstraintError(error)) {
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
    const durationMinutes =
      request.durationMinutes ?? APPOINTMENT_CONSTANTS.DEFAULT_DURATION_MINUTES;
    const notes = request.notes?.trim() || null;

    this.validateServiceName(serviceName);
    this.validateScheduledAt(scheduledAt);
    this.validateDuration(durationMinutes);
    this.validateNotes(notes);

    return {
      serviceName,
      scheduledAt,
      durationMinutes,
      notes,
    };
  }

  public async getAppointment(
    userId: string,
    appointmentId: string,
  ): Promise<AppointmentResponse> {
    if (!VALIDATION_PATTERNS.UUID.test(appointmentId)) {
      throwRequestValidationError(
        "appointmentId",
        VALIDATION_MESSAGES.APPOINTMENT_ID,
      );
    }

    const appointment = await appointmentDal.findAppointmentForUser(
      appointmentId,
      userId,
    );

    if (!appointment) {
      throw new AppError(
        404,
        ERROR_CODES.APPOINTMENT_NOT_FOUND,
        ERROR_MESSAGES.APPOINTMENT_NOT_FOUND,
      );
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
          id: decodedCursor.id,
          scheduledAt: decodedCursor.timestamp,
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
              lastRecord.scheduledAt,
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
