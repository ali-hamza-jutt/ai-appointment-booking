import {
  APPOINTMENT_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  VALIDATION_MESSAGES,
  VALIDATION_PATTERNS,
} from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import { isUniqueConstraintError } from "../../utils/database.js";
import { normalizeWhitespace } from "../../utils/text.js";
import { appointmentDal } from "./dal/appointment.dal.js";
import type {
  AppointmentListResponse,
  AppointmentPageCursor,
  AppointmentRecord,
  AppointmentResponse,
  AppointmentSource,
  CreateAppointmentRequest,
  ListAppointmentsOptions,
} from "./dto/appointment.dto.js";

interface SerializedAppointmentCursor {
  id: string;
  scheduledAt: string;
}

export class AppointmentService {
  public async createAppointment(
    userId: string,
    request: CreateAppointmentRequest,
    source: AppointmentSource = "FORM",
  ): Promise<AppointmentResponse> {
    const serviceName = normalizeWhitespace(request.serviceName);
    const scheduledAt = request.scheduledAt;
    const durationMinutes =
      request.durationMinutes ?? APPOINTMENT_CONSTANTS.DEFAULT_DURATION_MINUTES;
    const notes = request.notes?.trim() || null;

    this.validateServiceName(serviceName);
    this.validateScheduledAt(scheduledAt);
    this.validateDuration(durationMinutes);
    this.validateNotes(notes);

    try {
      const appointment = await appointmentDal.createAppointment({
        userId,
        serviceName,
        scheduledAt,
        durationMinutes,
        source,
        notes,
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

  public async getAppointment(
    userId: string,
    appointmentId: string,
  ): Promise<AppointmentResponse> {
    if (!VALIDATION_PATTERNS.UUID.test(appointmentId)) {
      this.throwValidationError(
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

    const cursor = options.cursor
      ? this.decodeCursor(options.cursor)
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
        ? { nextCursor: this.encodeCursor(lastRecord) }
        : {}),
    };
  }

  private validateServiceName(serviceName: string): void {
    if (
      serviceName.length < APPOINTMENT_CONSTANTS.MIN_SERVICE_NAME_LENGTH ||
      serviceName.length > APPOINTMENT_CONSTANTS.MAX_SERVICE_NAME_LENGTH
    ) {
      this.throwValidationError(
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
      this.throwValidationError(
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
      this.throwValidationError(
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
      this.throwValidationError(
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
      this.throwValidationError("limit", VALIDATION_MESSAGES.PAGINATION_LIMIT);
    }
  }

  private encodeCursor(appointment: AppointmentRecord): string {
    const cursor: SerializedAppointmentCursor = {
      id: appointment.id,
      scheduledAt: appointment.scheduledAt.toISOString(),
    };

    return Buffer.from(JSON.stringify(cursor)).toString("base64url");
  }

  private decodeCursor(cursor: string): AppointmentPageCursor {
    try {
      const value = JSON.parse(
        Buffer.from(cursor, "base64url").toString("utf8"),
      ) as Partial<SerializedAppointmentCursor>;
      const scheduledAt = new Date(value.scheduledAt ?? "");

      if (
        typeof value.id !== "string" ||
        !VALIDATION_PATTERNS.UUID.test(value.id) ||
        Number.isNaN(scheduledAt.getTime())
      ) {
        throw new Error("Invalid appointment cursor values");
      }

      return {
        id: value.id,
        scheduledAt,
      };
    } catch {
      throw new AppError(
        422,
        ERROR_CODES.INVALID_PAGINATION_CURSOR,
        ERROR_MESSAGES.INVALID_PAGINATION_CURSOR,
        { cursor: [ERROR_MESSAGES.INVALID_PAGINATION_CURSOR] },
      );
    }
  }

  private throwValidationError(field: string, message: string): never {
    throw new AppError(
      422,
      ERROR_CODES.REQUEST_VALIDATION_FAILED,
      ERROR_MESSAGES.REQUEST_VALIDATION_FAILED,
      { [field]: [message] },
    );
  }

  private toResponse(appointment: AppointmentRecord): AppointmentResponse {
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
