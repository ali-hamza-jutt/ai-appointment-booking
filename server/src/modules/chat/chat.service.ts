import {
  APPOINTMENT_CONSTANTS,
  CHAT_CONSTANTS,
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
import { throwRequestValidationError } from "../../utils/validation.js";
import { chatDal } from "./dal/chat.dal.js";
import type {
  AppointmentBookingContext,
  ChatMessageListResponse,
  ChatMessageMetadata,
  ChatMessageRecord,
  ChatMessageResponse,
  ChatSessionListResponse,
  ChatSessionRecord,
  ChatSessionResponse,
  CreateChatMessageData,
  CreateChatMessageRequest,
  CreateChatSessionRequest,
  ListChatMessagesOptions,
  ListChatSessionsOptions,
  StoredAppointmentBookingContext,
  StoredChatMessageMetadata,
} from "./dto/chat.dto.js";

export class ChatService {
  public async createSession(
    userId: string,
    request: CreateChatSessionRequest,
  ): Promise<ChatSessionResponse> {
    const title = request.title
      ? normalizeWhitespace(request.title) || null
      : null;
    const bookingContext = request.bookingContext
      ? this.normalizeBookingContext(request.bookingContext)
      : null;

    if (title && title.length > CHAT_CONSTANTS.MAX_SESSION_TITLE_LENGTH) {
      throwRequestValidationError(
        "title",
        VALIDATION_MESSAGES.CHAT_SESSION_TITLE,
      );
    }

    const session = await chatDal.createSession({
      userId,
      title,
      bookingContext: bookingContext
        ? this.serializeBookingContext(bookingContext)
        : null,
    });

    return this.toSessionResponse(session);
  }

  public async getSession(
    userId: string,
    sessionId: string,
  ): Promise<ChatSessionResponse> {
    this.validateSessionId(sessionId);
    const session = await chatDal.findSessionForUser(sessionId, userId);

    if (!session) {
      this.throwSessionNotFound();
    }

    return this.toSessionResponse(session);
  }

  public async listSessions(
    userId: string,
    options: ListChatSessionsOptions,
  ): Promise<ChatSessionListResponse> {
    const limit = options.limit ?? CHAT_CONSTANTS.DEFAULT_SESSION_PAGE_SIZE;
    this.validateLimit(
      limit,
      CHAT_CONSTANTS.MAX_SESSION_PAGE_SIZE,
      VALIDATION_MESSAGES.CHAT_SESSION_LIMIT,
    );
    const decodedCursor = options.cursor
      ? decodeTimestampCursor(options.cursor)
      : undefined;

    if (options.cursor && !decodedCursor) {
      this.throwInvalidCursor();
    }

    const cursor = decodedCursor
      ? {
          id: decodedCursor.id,
          updatedAt: decodedCursor.timestamp,
        }
      : undefined;
    const records = await chatDal.listSessions({
      userId,
      ...(options.status ? { status: options.status } : {}),
      ...(cursor ? { cursor } : {}),
      take: limit + 1,
    });
    const hasMore = records.length > limit;
    const page = hasMore ? records.slice(0, limit) : records;
    const lastRecord = page.at(-1);

    return {
      items: page.map((session) => this.toSessionResponse(session)),
      ...(hasMore && lastRecord
        ? {
            nextCursor: encodeTimestampCursor(
              lastRecord.id,
              lastRecord.updatedAt,
            ),
          }
        : {}),
    };
  }

  public async createUserMessage(
    userId: string,
    sessionId: string,
    request: CreateChatMessageRequest,
  ): Promise<ChatMessageResponse> {
    this.validateSessionId(sessionId);

    if (!VALIDATION_PATTERNS.UUID.test(request.clientMessageId)) {
      throwRequestValidationError(
        "clientMessageId",
        VALIDATION_MESSAGES.CHAT_MESSAGE_ID,
      );
    }

    const content = this.normalizeMessageContent(request.content);

    return this.createMessage({
      userId,
      sessionId,
      clientMessageId: request.clientMessageId,
      role: "USER",
      content,
      structuredData: null,
    });
  }

  public async createAssistantMessage(
    userId: string,
    sessionId: string,
    content: string,
    structuredData: ChatMessageMetadata | null = null,
  ): Promise<ChatMessageResponse> {
    this.validateSessionId(sessionId);

    return this.createMessage({
      userId,
      sessionId,
      clientMessageId: null,
      role: "ASSISTANT",
      content: this.normalizeMessageContent(content),
      structuredData: structuredData
        ? this.serializeMessageMetadata(structuredData)
        : null,
    });
  }

  public async listMessages(
    userId: string,
    sessionId: string,
    options: ListChatMessagesOptions,
  ): Promise<ChatMessageListResponse> {
    this.validateSessionId(sessionId);
    const limit = options.limit ?? CHAT_CONSTANTS.DEFAULT_MESSAGE_PAGE_SIZE;
    this.validateLimit(
      limit,
      CHAT_CONSTANTS.MAX_MESSAGE_PAGE_SIZE,
      VALIDATION_MESSAGES.CHAT_MESSAGE_LIMIT,
    );
    const decodedCursor = options.cursor
      ? decodeTimestampCursor(options.cursor)
      : undefined;

    if (options.cursor && !decodedCursor) {
      this.throwInvalidCursor();
    }

    const cursor = decodedCursor
      ? {
          id: decodedCursor.id,
          createdAt: decodedCursor.timestamp,
        }
      : undefined;
    const records = await chatDal.listMessagesForSession({
      userId,
      sessionId,
      ...(cursor ? { cursor } : {}),
      take: limit + 1,
    });

    if (!records) {
      this.throwSessionNotFound();
    }

    const hasMore = records.length > limit;
    const page = hasMore ? records.slice(0, limit) : records;
    const lastRecord = page.at(-1);

    return {
      items: page.map((message) => this.toMessageResponse(message)),
      hasMore,
      ...(lastRecord
        ? {
            nextCursor: encodeTimestampCursor(
              lastRecord.id,
              lastRecord.createdAt,
            ),
          }
        : {}),
    };
  }

  public async updateBookingContext(
    userId: string,
    sessionId: string,
    bookingContext: AppointmentBookingContext,
  ): Promise<ChatSessionResponse> {
    this.validateSessionId(sessionId);

    try {
      const session = await chatDal.updateBookingContext({
        userId,
        sessionId,
        bookingContext: this.serializeBookingContext(
          this.normalizeBookingContext(bookingContext),
        ),
      });

      return this.toSessionResponse(session);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        this.throwSessionNotFound();
      }

      throw error;
    }
  }

  private async createMessage(
    data: CreateChatMessageData,
  ): Promise<ChatMessageResponse> {
    try {
      const message = await chatDal.createMessage(data);
      return this.toMessageResponse(message);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        if (data.clientMessageId) {
          const existingMessage = await chatDal.findMessageByClientIdForUser(
            data.sessionId,
            data.userId,
            data.clientMessageId,
          );

          if (
            existingMessage &&
            existingMessage.role === data.role &&
            existingMessage.content === data.content
          ) {
            return this.toMessageResponse(existingMessage);
          }
        }

        throw new AppError(
          409,
          ERROR_CODES.CHAT_MESSAGE_ALREADY_EXISTS,
          ERROR_MESSAGES.CHAT_MESSAGE_ALREADY_EXISTS,
        );
      }

      if (isRecordNotFoundError(error)) {
        this.throwSessionNotFound();
      }

      throw error;
    }
  }

  private normalizeBookingContext(
    context: AppointmentBookingContext,
  ): AppointmentBookingContext {
    const serviceName = context.serviceName
      ? normalizeWhitespace(context.serviceName)
      : undefined;
    const notes = context.notes?.trim() || undefined;

    if (
      serviceName !== undefined &&
      (serviceName.length < APPOINTMENT_CONSTANTS.MIN_SERVICE_NAME_LENGTH ||
        serviceName.length > APPOINTMENT_CONSTANTS.MAX_SERVICE_NAME_LENGTH)
    ) {
      throwRequestValidationError(
        "bookingContext.serviceName",
        VALIDATION_MESSAGES.APPOINTMENT_SERVICE_NAME,
      );
    }

    if (
      context.scheduledAt !== undefined &&
      (!(context.scheduledAt instanceof Date) ||
        Number.isNaN(context.scheduledAt.getTime()) ||
        context.scheduledAt.getTime() <= Date.now())
    ) {
      throwRequestValidationError(
        "bookingContext.scheduledAt",
        VALIDATION_MESSAGES.BOOKING_CONTEXT_TIME,
      );
    }

    if (
      context.durationMinutes !== undefined &&
      (!Number.isInteger(context.durationMinutes) ||
        context.durationMinutes < APPOINTMENT_CONSTANTS.MIN_DURATION_MINUTES ||
        context.durationMinutes > APPOINTMENT_CONSTANTS.MAX_DURATION_MINUTES)
    ) {
      throwRequestValidationError(
        "bookingContext.durationMinutes",
        VALIDATION_MESSAGES.BOOKING_CONTEXT_DURATION,
      );
    }

    if (
      notes !== undefined &&
      notes.length > APPOINTMENT_CONSTANTS.MAX_NOTES_LENGTH
    ) {
      throwRequestValidationError(
        "bookingContext.notes",
        VALIDATION_MESSAGES.APPOINTMENT_NOTES,
      );
    }

    return {
      ...(serviceName !== undefined ? { serviceName } : {}),
      ...(context.scheduledAt !== undefined
        ? { scheduledAt: context.scheduledAt }
        : {}),
      ...(context.durationMinutes !== undefined
        ? { durationMinutes: context.durationMinutes }
        : {}),
      ...(notes !== undefined ? { notes } : {}),
    };
  }

  private normalizeMessageContent(content: string): string {
    const normalized = content.trim();

    if (
      normalized.length < CHAT_CONSTANTS.MIN_MESSAGE_LENGTH ||
      normalized.length > CHAT_CONSTANTS.MAX_MESSAGE_LENGTH
    ) {
      throwRequestValidationError(
        "content",
        VALIDATION_MESSAGES.CHAT_MESSAGE_CONTENT,
      );
    }

    return normalized;
  }

  private serializeBookingContext(
    context: AppointmentBookingContext,
  ): StoredAppointmentBookingContext {
    return {
      ...(context.serviceName !== undefined
        ? { serviceName: context.serviceName }
        : {}),
      ...(context.scheduledAt !== undefined
        ? { scheduledAt: context.scheduledAt.toISOString() }
        : {}),
      ...(context.durationMinutes !== undefined
        ? { durationMinutes: context.durationMinutes }
        : {}),
      ...(context.notes !== undefined ? { notes: context.notes } : {}),
    };
  }

  private deserializeBookingContext(
    value: unknown,
  ): AppointmentBookingContext | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const context = value as Partial<StoredAppointmentBookingContext>;
    const scheduledAt = context.scheduledAt
      ? new Date(context.scheduledAt)
      : undefined;

    return {
      ...(typeof context.serviceName === "string"
        ? { serviceName: context.serviceName }
        : {}),
      ...(scheduledAt && !Number.isNaN(scheduledAt.getTime())
        ? { scheduledAt }
        : {}),
      ...(typeof context.durationMinutes === "number"
        ? { durationMinutes: context.durationMinutes }
        : {}),
      ...(typeof context.notes === "string" ? { notes: context.notes } : {}),
    };
  }

  private serializeMessageMetadata(
    metadata: ChatMessageMetadata,
  ): StoredChatMessageMetadata {
    return {
      ...(metadata.intent !== undefined ? { intent: metadata.intent } : {}),
      ...(metadata.bookingContext
        ? {
            bookingContext: this.serializeBookingContext(
              this.normalizeBookingContext(metadata.bookingContext),
            ),
          }
        : {}),
      ...(metadata.missingFields !== undefined
        ? { missingFields: metadata.missingFields }
        : {}),
      ...(metadata.confirmationRequired !== undefined
        ? { confirmationRequired: metadata.confirmationRequired }
        : {}),
      ...(metadata.appointmentId !== undefined
        ? { appointmentId: metadata.appointmentId }
        : {}),
    };
  }

  private deserializeMessageMetadata(
    value: unknown,
  ): ChatMessageMetadata | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const metadata = value as Partial<StoredChatMessageMetadata>;

    return {
      ...(metadata.intent === "BOOK_APPOINTMENT" ||
      metadata.intent === "UNKNOWN"
        ? { intent: metadata.intent }
        : {}),
      ...(metadata.bookingContext
        ? {
            bookingContext:
              this.deserializeBookingContext(metadata.bookingContext) ?? {},
          }
        : {}),
      ...(Array.isArray(metadata.missingFields) &&
      metadata.missingFields.every((field) => typeof field === "string")
        ? { missingFields: metadata.missingFields }
        : {}),
      ...(typeof metadata.confirmationRequired === "boolean"
        ? { confirmationRequired: metadata.confirmationRequired }
        : {}),
      ...(typeof metadata.appointmentId === "string"
        ? { appointmentId: metadata.appointmentId }
        : {}),
    };
  }

  private validateSessionId(sessionId: string): void {
    if (!VALIDATION_PATTERNS.UUID.test(sessionId)) {
      throwRequestValidationError(
        "sessionId",
        VALIDATION_MESSAGES.CHAT_SESSION_ID,
      );
    }
  }

  private validateLimit(limit: number, maximum: number, message: string): void {
    if (!Number.isInteger(limit) || limit < 1 || limit > maximum) {
      throwRequestValidationError("limit", message);
    }
  }

  private throwInvalidCursor(): never {
    throw new AppError(
      422,
      ERROR_CODES.INVALID_PAGINATION_CURSOR,
      ERROR_MESSAGES.INVALID_PAGINATION_CURSOR,
      { cursor: [ERROR_MESSAGES.INVALID_PAGINATION_CURSOR] },
    );
  }

  private throwSessionNotFound(): never {
    throw new AppError(
      404,
      ERROR_CODES.CHAT_SESSION_NOT_FOUND,
      ERROR_MESSAGES.CHAT_SESSION_NOT_FOUND,
    );
  }

  private toSessionResponse(session: ChatSessionRecord): ChatSessionResponse {
    return {
      id: session.id,
      title: session.title,
      status: session.status,
      bookingContext: this.deserializeBookingContext(session.bookingContext),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private toMessageResponse(message: ChatMessageRecord): ChatMessageResponse {
    return {
      id: message.id,
      sessionId: message.sessionId,
      clientMessageId: message.clientMessageId,
      role: message.role,
      content: message.content,
      structuredData: this.deserializeMessageMetadata(message.structuredData),
      createdAt: message.createdAt,
    };
  }
}

export const chatService = new ChatService();
