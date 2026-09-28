import {
  BUSINESS_CONSTANTS,
  CHAT_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  SUBSCRIPTION_CONSTANTS,
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
import { businessService } from "../businesses/business.service.js";
import { parseStoredParts } from "./chat-parts.schema.js";
import { chatBookingDal } from "./dal/chat-booking.dal.js";
import { entitlements } from "../subscriptions/entitlements.js";
import { publishChatEvent } from "./chat-events.js";
import { chatDal } from "./dal/chat.dal.js";
import type {
  AssistantTurnPersistenceResult,
  ChatBookingDraft,
  ChatChannel,
  ChatBookingPersistenceResult,
  ChatDraftPatch,
  ChatMemoryState,
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
  SaveChatSummaryData,
} from "./dto/chat.dto.js";

function isAuthor(value: unknown): value is { name: string } {
  return typeof value === "object" && value !== null && typeof (value as { name?: unknown }).name === "string";
}

export class ChatService {
  public async createSession(
    userId: string,
    request: CreateChatSessionRequest,
    channel: ChatChannel = request.channel ?? "WEB",
  ): Promise<ChatSessionResponse> {
    const title = request.title
      ? normalizeWhitespace(request.title) || null
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

    // Carrying on an open chat is free; starting one uses the plan's monthly allowance.
    if (!request.replaceActive) {
      const active = await chatDal.findActiveSessionForUser(userId, businessId);

      if (active) return this.toSessionResponse(active);
    }

    await entitlements.consumeOrThrow(businessId, SUBSCRIPTION_CONSTANTS.METRICS.AI_CONVERSATIONS);

    let session: ChatSessionRecord;

    try {
      session = await chatDal.createSession({
        businessId,
        userId,
        title,
        replaceActive: request.replaceActive ?? false,
        channel,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const activeSession = await chatDal.findActiveSessionForUser(userId, businessId);

        if (activeSession) {
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
    const businessSlug = options.businessSlug?.trim().toLowerCase();
    const records = await chatDal.listSessions({
      userId,
      ...(options.status ? { status: options.status } : {}),
      ...(businessSlug ? { businessSlug } : {}),
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

  public async updateDraft(
    userId: string,
    sessionId: string,
    draft: ChatDraftPatch,
  ): Promise<ChatSessionResponse> {
    this.validateSessionId(sessionId);

    try {
      return this.toSessionResponse(await chatDal.updateDraft({ userId, sessionId, draft }));
    } catch (error) {
      if (isRecordNotFoundError(error)) this.throwSessionNotFound();

      throw error;
    }
  }

  /** Flags the chat for staff to pick up. */
  public async requestHandoff(
    userId: string,
    sessionId: string,
    reason: string | null,
  ): Promise<ChatSessionResponse> {
    this.validateSessionId(sessionId);

    try {
      const session = this.toSessionResponse(await chatDal.requestHandoff(userId, sessionId, reason));

      publishChatEvent({ type: "handoff", sessionId, businessId: session.business.id, state: "requested" });

      return session;
    } catch (error) {
      if (isRecordNotFoundError(error)) this.throwSessionNotFound();

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

  /** How long the chat is and how much of it the rolling summary covers. */
  public async getMemoryState(userId: string, sessionId: string): Promise<ChatMemoryState> {
    this.validateSessionId(sessionId);
    const state = await chatDal.getMemoryState(userId, sessionId);

    if (!state) {
      this.throwSessionNotFound();
    }

    return state;
  }

  /** Messages by position, oldest first, for folding into the summary. */
  public async listMessageRange(
    userId: string,
    sessionId: string,
    skip: number,
    take: number,
  ): Promise<ChatMessageResponse[]> {
    this.validateSessionId(sessionId);
    const messages = await chatDal.listMessageRange({ userId, sessionId, skip, take });

    return messages.map((message) => this.toMessageResponse(message));
  }

  public saveSummary(data: SaveChatSummaryData): Promise<boolean> {
    return chatDal.saveSummary(data);
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
        ...(request.draft ? { draft: request.draft } : {}),
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

  private serializeMessageMetadata(metadata: ChatMessageMetadata): ChatMessageMetadata {
    return {
      ...(metadata.intent !== undefined ? { intent: metadata.intent } : {}),
      ...(metadata.parts?.length ? { parts: metadata.parts } : {}),
      ...(metadata.missingFields !== undefined ? { missingFields: metadata.missingFields } : {}),
      ...(metadata.confirmationRequired !== undefined
        ? { confirmationRequired: metadata.confirmationRequired }
        : {}),
      ...(metadata.appointmentId !== undefined ? { appointmentId: metadata.appointmentId } : {}),
      ...(metadata.sentBy ? { sentBy: { name: metadata.sentBy.name } } : {}),
    };
  }

  private deserializeMessageMetadata(value: unknown): ChatMessageMetadata | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const metadata = value as Record<string, unknown>;
    const parts = parseStoredParts(metadata.parts);

    return {
      ...(metadata.intent === "BOOK_APPOINTMENT" || metadata.intent === "UNKNOWN"
        ? { intent: metadata.intent }
        : {}),
      ...(parts.length > 0 ? { parts } : {}),
      ...(Array.isArray(metadata.missingFields) &&
      metadata.missingFields.every((field) => typeof field === "string")
        ? { missingFields: metadata.missingFields as string[] }
        : {}),
      ...(typeof metadata.confirmationRequired === "boolean"
        ? { confirmationRequired: metadata.confirmationRequired }
        : {}),
      ...(typeof metadata.appointmentId === "string"
        ? { appointmentId: metadata.appointmentId }
        : {}),
      ...(isAuthor(metadata.sentBy) ? { sentBy: { name: metadata.sentBy.name } } : {}),
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
      channel: session.channel,
      draft: this.toDraft(session),
      handoff: session.handoffRequestedAt
        ? {
            requestedAt: session.handoffRequestedAt,
            reason: session.handoffReason,
            resolvedAt: session.handoffResolvedAt,
          }
        : null,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  /** Only a still-held slot counts as the draft's hold. */
  private toDraft(session: ChatSessionRecord): ChatBookingDraft {
    const hold = session.draftHold?.status === "HELD" ? session.draftHold : null;

    return {
      service: session.draftService,
      staff: session.draftStaff,
      hold: hold
        ? {
            bookingId: hold.id,
            serviceName: hold.serviceName,
            staffName: hold.staff?.displayName ?? null,
            startsAt: hold.scheduledAt.toISOString(),
            endsAt: hold.endsAt.toISOString(),
            durationMinutes: hold.durationMinutes,
            priceMinor: hold.priceMinor,
            currency: hold.currency,
            status: hold.status,
            holdExpiresAt: hold.holdExpiresAt?.toISOString() ?? null,
            timeZone: hold.timeZone,
          }
        : null,
      timeZone: session.draftTimeZone,
      notes: session.draftNotes,
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
