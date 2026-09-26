import {
  APPOINTMENT_CONSTANTS,
  BUSINESS_CONSTANTS,
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
import { normalizeIanaTimeZone } from "../../utils/time-zone.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { businessService } from "../businesses/business.service.js";
import { chatBookingDal } from "./dal/chat-booking.dal.js";
import { chatDal } from "./dal/chat.dal.js";
import type {
  AssistantTurnPersistenceResult,
  AppointmentBookingContext,
  ChatBookingPersistenceResult,
  ChatMessageCreationResult,
  ChatMessageListResponse,
  ChatMessageMetadata,
  ChatMessageRecord,
  ChatMessageResponse,
  ChatSessionListResponse,
  ChatSessionRecord,
  ChatSessionResponse,
  ChatSessionWithMessagesRecord,
  CompleteChatBookingRequest,
  ConfirmedChatBookingRecord,
  CreateChatMessageData,
  CreateChatMessageRequest,
  CreateChatSessionRequest,
  ListChatMessagesOptions,
  ListChatSessionsOptions,
  SaveAssistantTurnRequest,
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
    // Clients may seed only what a customer could type; hold details are server-owned.
    const bookingContext = request.bookingContext
      ? this.normalizeBookingContext({
          ...(request.bookingContext.serviceName !== undefined
            ? { serviceName: request.bookingContext.serviceName }
            : {}),
          ...(request.bookingContext.scheduledAt !== undefined
            ? { scheduledAt: request.bookingContext.scheduledAt }
            : {}),
          ...(request.bookingContext.timeZone !== undefined
            ? { timeZone: request.bookingContext.timeZone }
            : {}),
          ...(request.bookingContext.durationMinutes !== undefined
            ? { durationMinutes: request.bookingContext.durationMinutes }
            : {}),
          ...(request.bookingContext.notes !== undefined
            ? { notes: request.bookingContext.notes }
            : {}),
        })
      : null;
    const businessId = request.businessSlug
      ? (await businessService.getPublicBusiness(request.businessSlug)).id
      : BUSINESS_CONSTANTS.DEMO_BUSINESS_ID;

    if (title && title.length > CHAT_CONSTANTS.MAX_SESSION_TITLE_LENGTH) {
      throwRequestValidationError(
        "title",
        VALIDATION_MESSAGES.CHAT_SESSION_TITLE,
      );
    }

    let session: ChatSessionRecord;

    try {
      session = await chatDal.createSession({
        businessId,
        userId,
        title,
        bookingContext: bookingContext
          ? this.serializeBookingContext(bookingContext)
          : null,
        replaceActive: request.replaceActive ?? false,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const activeSession = await chatDal.findActiveSessionForUser(userId);

        if (activeSession?.business.id === businessId) {
          return this.toSessionResponse(activeSession);
        }
      }

      throw error;
    }

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
    const result = await this.createUserMessageWithStatus(
      userId,
      sessionId,
      request,
    );

    return result.message;
  }

  public async createUserMessageWithStatus(
    userId: string,
    sessionId: string,
    request: CreateChatMessageRequest,
  ): Promise<ChatMessageCreationResult> {
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
      replyToMessageId: null,
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

    const result = await this.createMessage({
      userId,
      sessionId,
      clientMessageId: null,
      replyToMessageId: null,
      role: "ASSISTANT",
      content: this.normalizeMessageContent(content),
      structuredData: structuredData
        ? this.serializeMessageMetadata(structuredData)
        : null,
    });

    return result.message;
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

  public async findAssistantReply(
    userId: string,
    sessionId: string,
    userMessageId: string,
  ): Promise<ChatMessageResponse | null> {
    this.validateSessionId(sessionId);

    if (!VALIDATION_PATTERNS.UUID.test(userMessageId)) {
      throwRequestValidationError(
        "userMessageId",
        VALIDATION_MESSAGES.CHAT_MESSAGE_ID,
      );
    }

    const reply = await chatDal.findAssistantReplyForUserMessage(
      sessionId,
      userId,
      userMessageId,
    );

    return reply ? this.toMessageResponse(reply) : null;
  }

  public async listRecentMessages(
    userId: string,
    sessionId: string,
    limit: number,
  ): Promise<ChatMessageResponse[]> {
    this.validateSessionId(sessionId);
    this.validateLimit(
      limit,
      CHAT_CONSTANTS.MAX_MESSAGE_PAGE_SIZE,
      VALIDATION_MESSAGES.CHAT_MESSAGE_LIMIT,
    );

    const messages = await chatDal.listRecentMessages({
      userId,
      sessionId,
      take: limit,
    });

    return messages.map((message) => this.toMessageResponse(message));
  }

  public async saveAssistantTurn(
    userId: string,
    sessionId: string,
    request: SaveAssistantTurnRequest,
  ): Promise<AssistantTurnPersistenceResult> {
    this.validateSessionId(sessionId);

    if (!VALIDATION_PATTERNS.UUID.test(request.replyToMessageId)) {
      throwRequestValidationError(
        "replyToMessageId",
        VALIDATION_MESSAGES.CHAT_MESSAGE_ID,
      );
    }

    try {
      const record = await chatDal.saveAssistantTurn({
        userId,
        sessionId,
        replyToMessageId: request.replyToMessageId,
        content: this.normalizeMessageContent(request.content),
        ...(request.bookingContext
          ? {
              bookingContext: this.serializeBookingContext(
                this.normalizeBookingContext(request.bookingContext),
              ),
            }
          : {}),
        structuredData: this.serializeMessageMetadata(request.structuredData),
      });

      return this.toAssistantTurnPersistence(record);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const [reply, session] = await Promise.all([
          chatDal.findAssistantReplyForUserMessage(
            sessionId,
            userId,
            request.replyToMessageId,
          ),
          chatDal.findSessionForUser(sessionId, userId),
        ]);

        if (reply && session) {
          return {
            session: this.toSessionResponse(session),
            assistantMessage: this.toMessageResponse(reply),
          };
        }
      }

      if (isRecordNotFoundError(error)) {
        const session = await chatDal.findSessionForUser(sessionId, userId);

        if (!session) {
          this.throwSessionNotFound();
        }

        this.throwSessionNotActive();
      }

      throw error;
    }
  }

  /** The finished booking for a session, once its confirmation message exists. */
  public async findConfirmedBooking(
    userId: string,
    sessionId: string,
  ): Promise<ChatBookingPersistenceResult | null> {
    this.validateSessionId(sessionId);
    const record = await chatBookingDal.findConfirmedBooking(userId, sessionId);

    return record?.booking && record.messages.length > 0
      ? this.toChatBookingPersistence(record)
      : null;
  }

  public async completeBooking(
    userId: string,
    sessionId: string,
    request: CompleteChatBookingRequest,
  ): Promise<ChatBookingPersistenceResult> {
    this.validateSessionId(sessionId);

    try {
      const record = await chatBookingDal.completeBooking({
        userId,
        sessionId,
        bookingId: request.bookingId,
        assistantContent: this.normalizeMessageContent(request.assistantContent),
        assistantStructuredData: this.serializeMessageMetadata(
          request.assistantStructuredData,
        ),
      });

      return this.toChatBookingPersistence(record);
    } catch (error) {
      if (!isRecordNotFoundError(error)) throw error;

      // A concurrent confirmation may already have closed the session.
      const confirmedBooking = await chatBookingDal.findConfirmedBooking(userId, sessionId);

      if (confirmedBooking) {
        return this.toChatBookingPersistence(confirmedBooking);
      }

      const session = await chatDal.findSessionForUser(sessionId, userId);

      if (!session) {
        this.throwSessionNotFound();
      }

      this.throwSessionNotActive();
    }
  }

  private async createMessage(
    data: CreateChatMessageData,
  ): Promise<ChatMessageCreationResult> {
    try {
      const message = await chatDal.createMessage(data);
      return {
        message: this.toMessageResponse(message),
        created: true,
      };
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
            return {
              message: this.toMessageResponse(existingMessage),
              created: false,
            };
          }
        }

        throw new AppError(
          409,
          ERROR_CODES.CHAT_MESSAGE_ALREADY_EXISTS,
          ERROR_MESSAGES.CHAT_MESSAGE_ALREADY_EXISTS,
        );
      }

      if (isRecordNotFoundError(error)) {
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
            return {
              message: this.toMessageResponse(existingMessage),
              created: false,
            };
          }
        }

        const session = await chatDal.findSessionForUser(
          data.sessionId,
          data.userId,
        );

        if (!session) {
          this.throwSessionNotFound();
        }

        this.throwSessionNotActive();
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
    const timeZone =
      context.timeZone !== undefined
        ? normalizeIanaTimeZone(context.timeZone)
        : undefined;

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
      context.timeZone !== undefined &&
      !timeZone
    ) {
      throwRequestValidationError(
        "bookingContext.timeZone",
        VALIDATION_MESSAGES.APPOINTMENT_TIME_ZONE,
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
      ...this.pickHoldFields(context),
      ...(context.holdExpiresAt !== undefined
        ? { holdExpiresAt: context.holdExpiresAt }
        : {}),
      ...(context.scheduledAt !== undefined
        ? { scheduledAt: context.scheduledAt }
        : {}),
      ...(timeZone ? { timeZone } : {}),
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

  private pickHoldFields(context: AppointmentBookingContext) {
    return {
      ...(context.serviceId !== undefined ? { serviceId: context.serviceId } : {}),
      ...(context.staffId !== undefined ? { staffId: context.staffId } : {}),
      ...(context.staffName !== undefined ? { staffName: context.staffName } : {}),
      ...(context.holdBookingId !== undefined
        ? { holdBookingId: context.holdBookingId }
        : {}),
      ...(context.priceMinor !== undefined ? { priceMinor: context.priceMinor } : {}),
      ...(context.currency !== undefined ? { currency: context.currency } : {}),
    };
  }

  private serializeBookingContext(
    context: AppointmentBookingContext,
  ): StoredAppointmentBookingContext {
    return {
      ...(context.serviceName !== undefined
        ? { serviceName: context.serviceName }
        : {}),
      ...this.pickHoldFields(context),
      ...(context.holdExpiresAt !== undefined
        ? { holdExpiresAt: context.holdExpiresAt.toISOString() }
        : {}),
      ...(context.scheduledAt !== undefined
        ? { scheduledAt: context.scheduledAt.toISOString() }
        : {}),
      ...(context.timeZone !== undefined ? { timeZone: context.timeZone } : {}),
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
    const holdExpiresAt = context.holdExpiresAt
      ? new Date(context.holdExpiresAt)
      : undefined;
    const stringField = (key: keyof StoredAppointmentBookingContext) =>
      typeof context[key] === "string" ? { [key]: context[key] as string } : {};

    return {
      ...(typeof context.serviceName === "string"
        ? { serviceName: context.serviceName }
        : {}),
      ...stringField("serviceId"),
      ...stringField("staffId"),
      ...stringField("staffName"),
      ...stringField("holdBookingId"),
      ...stringField("currency"),
      ...(typeof context.priceMinor === "number" ? { priceMinor: context.priceMinor } : {}),
      ...(holdExpiresAt && !Number.isNaN(holdExpiresAt.getTime()) ? { holdExpiresAt } : {}),
      ...(scheduledAt && !Number.isNaN(scheduledAt.getTime())
        ? { scheduledAt }
        : {}),
      ...(typeof context.timeZone === "string"
        ? { timeZone: context.timeZone }
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
      ...(metadata.suggestedTimes !== undefined
        ? { suggestedTimes: metadata.suggestedTimes.map((time) => time.toISOString()) }
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
      ...(Array.isArray(metadata.suggestedTimes)
        ? {
            suggestedTimes: metadata.suggestedTimes
              .filter((time): time is string => typeof time === "string")
              .map((time) => new Date(time))
              .filter((time) => !Number.isNaN(time.getTime())),
          }
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

  private throwSessionNotActive(): never {
    throw new AppError(
      409,
      ERROR_CODES.CHAT_SESSION_NOT_ACTIVE,
      ERROR_MESSAGES.CHAT_SESSION_NOT_ACTIVE,
    );
  }

  private toAssistantTurnPersistence(
    record: ChatSessionWithMessagesRecord,
  ): AssistantTurnPersistenceResult {
    const assistantMessage = record.messages[0];

    if (!assistantMessage) {
      throw new Error("Saved assistant message was not returned");
    }

    return {
      session: this.toSessionResponse(record),
      assistantMessage: this.toMessageResponse(assistantMessage),
    };
  }

  private toChatBookingPersistence(
    record: ConfirmedChatBookingRecord,
  ): ChatBookingPersistenceResult {
    const assistantMessage = record.messages[0];

    if (!record.booking || !assistantMessage) {
      throw new Error("Completed chat booking was not returned");
    }

    return {
      session: this.toSessionResponse(record),
      assistantMessage: this.toMessageResponse(assistantMessage),
      booking: record.booking,
    };
  }

  private toSessionResponse(session: ChatSessionRecord): ChatSessionResponse {
    return {
      id: session.id,
      business: session.business,
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
      replyToMessageId: message.replyToMessageId,
      role: message.role,
      content: message.content,
      structuredData: this.deserializeMessageMetadata(message.structuredData),
      createdAt: message.createdAt,
    };
  }
}

export const chatService = new ChatService();
