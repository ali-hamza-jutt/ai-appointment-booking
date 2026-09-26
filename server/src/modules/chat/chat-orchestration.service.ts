import { aiService } from "../../integrations/ai/ai.service.js";
import type {
  AiAppointmentContext,
  AiAppointmentIntent,
  AiBookingField,
  AiConversationMessage,
} from "../../integrations/ai/dto/ai.dto.js";
import {
  AI_CONSTANTS,
  BOOKING_CONSTANTS,
  CHAT_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  VALIDATION_MESSAGES,
} from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import { formatMinorAmount } from "../../utils/money.js";
import {
  localDateTimeToUtc,
  normalizeIanaTimeZone,
} from "../../utils/time-zone.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { bookingService } from "../bookings/booking.service.js";
import type { BookingActor } from "../bookings/dto/booking.dto.js";
import { catalogService } from "../catalog/catalog.service.js";
import type {
  AppointmentBookingContext,
  ChatMessageMetadata,
  ChatMessageResponse,
  ChatSessionResponse,
  ChatTurnResponse,
  ConfirmChatBookingResponse,
  ProcessChatMessageRequest,
  StructuredBookingDetails,
} from "./dto/chat.dto.js";
import type {
  ChatOrchestrationAiPort,
  ChatOrchestrationBookingPort,
  ChatOrchestrationCatalogPort,
  ChatOrchestrationChatPort,
  PreparedChatBooking,
} from "./dto/chat-orchestration.dto.js";
import { chatService } from "./chat.service.js";

export class ChatOrchestrationService {
  public constructor(
    private readonly ai: ChatOrchestrationAiPort,
    private readonly chat: ChatOrchestrationChatPort,
    private readonly bookings: ChatOrchestrationBookingPort,
    private readonly catalog: ChatOrchestrationCatalogPort,
  ) {}

  public async processMessage(
    userId: string,
    sessionId: string,
    request: ProcessChatMessageRequest,
  ): Promise<ChatTurnResponse> {
    const timeZone = normalizeIanaTimeZone(request.timeZone);

    if (!timeZone) {
      throwRequestValidationError("timeZone", VALIDATION_MESSAGES.AI_TIME_ZONE);
    }

    const userMessageResult = await this.chat.createUserMessageWithStatus(
      userId,
      sessionId,
      request,
    );
    const userMessage = userMessageResult.message;

    if (!userMessageResult.created) {
      const existingReply = await this.chat.findAssistantReply(
        userId,
        sessionId,
        userMessage.id,
      );

      if (existingReply) {
        return {
          session: await this.chat.getSession(userId, sessionId),
          userMessage,
          assistantMessage: existingReply,
        };
      }
    }

    const session = await this.chat.getSession(userId, sessionId);

    if (session.status !== "ACTIVE") {
      throw new AppError(
        409,
        session.status === "CLOSED"
          ? ERROR_CODES.CHAT_SESSION_CLOSED
          : ERROR_CODES.CHAT_SESSION_NOT_ACTIVE,
        session.status === "CLOSED"
          ? ERROR_MESSAGES.CHAT_SESSION_CLOSED
          : ERROR_MESSAGES.CHAT_SESSION_NOT_ACTIVE,
      );
    }

    if (request.bookingDetails) {
      return this.processStructuredBookingDetails(
        userId,
        session,
        userMessage,
        request.bookingDetails,
        timeZone,
      );
    }

    const recentMessages = await this.chat.listRecentMessages(
      userId,
      sessionId,
      AI_CONSTANTS.HISTORY_QUERY_LIMIT,
    );
    const extraction = await this.ai.extractAppointmentDetails({
      userMessage: userMessage.content,
      conversationHistory: this.toConversationHistory(recentMessages, userMessage.id),
      ...(session.bookingContext
        ? { appointmentContext: this.toAiAppointmentContext(session.bookingContext) }
        : {}),
      timeZone,
    });

    if (extraction.intent !== "BOOK_APPOINTMENT") {
      const hasHold = this.hasActiveHold(session.bookingContext);

      return this.saveTurn(userId, session, userMessage, {
        content: this.buildNonBookingResponse(extraction.intent, extraction.assistantReply),
        metadata: {
          intent: "UNKNOWN",
          missingFields: this.getMissingBookingFields(session.bookingContext),
          confirmationRequired: hasHold,
        },
      });
    }

    const requestedContext = this.toBookingContext(extraction.appointmentContext, timeZone);
    const isComplete =
      !extraction.clarificationQuestion &&
      extraction.missingFields.length === 0 &&
      Boolean(requestedContext.serviceName) &&
      Boolean(requestedContext.scheduledAt);

    if (!isComplete) {
      await this.releaseChangedHold(userId, session.bookingContext, null);

      return this.saveTurn(userId, session, userMessage, {
        content:
          extraction.clarificationQuestion ??
          AI_CONSTANTS.CLARIFICATION_QUESTIONS.serviceNameAndScheduledAt,
        bookingContext: requestedContext,
        metadata: {
          intent: "BOOK_APPOINTMENT",
          bookingContext: requestedContext,
          missingFields: extraction.missingFields,
          confirmationRequired: false,
        },
      });
    }

    const service = await this.catalog.matchServiceByName(
      session.business.id,
      requestedContext.serviceName ?? "",
    );
    const prepared = service
      ? await this.prepareBooking(userId, session, requestedContext, service, undefined)
      : await this.explainUnknownService(userId, session, requestedContext);

    return this.saveTurn(userId, session, userMessage, {
      content: prepared.content,
      bookingContext: prepared.context,
      metadata: {
        intent: "BOOK_APPOINTMENT",
        bookingContext: prepared.context,
        missingFields: prepared.missingFields,
        confirmationRequired: prepared.confirmationRequired,
        ...(prepared.suggestedTimes ? { suggestedTimes: prepared.suggestedTimes } : {}),
      },
    });
  }

  public async confirmBooking(
    userId: string,
    sessionId: string,
  ): Promise<ConfirmChatBookingResponse> {
    const existingBooking = await this.chat.findConfirmedBooking(userId, sessionId);

    if (existingBooking) {
      return {
        session: existingBooking.session,
        assistantMessage: existingBooking.assistantMessage,
        appointment: this.bookings.toAppointmentResponse(existingBooking.booking),
      };
    }

    const session = await this.chat.getSession(userId, sessionId);
    const holdBookingId = session.bookingContext?.holdBookingId;
    const hold = holdBookingId
      ? await this.bookings.findHeldForUser(userId, holdBookingId)
      : null;

    if (!hold) {
      throw new AppError(
        409,
        ERROR_CODES.CHAT_BOOKING_CONTEXT_INCOMPLETE,
        ERROR_MESSAGES.CHAT_BOOKING_CONTEXT_INCOMPLETE,
      );
    }

    const booking = await this.bookings.confirmHold(hold, this.customer(userId), {
      chatSessionId: sessionId,
    });
    const timeZone = session.bookingContext?.timeZone ?? booking.timeZone;
    const when = this.formatDateTime(booking.scheduledAt, timeZone);
    const content =
      booking.status === "PENDING"
        ? `${CHAT_CONSTANTS.ASSISTANT_MESSAGES.BOOKING_PENDING_PREFIX}: ${booking.serviceName} on ${when} at ${booking.business.name}. You'll see it confirmed in My appointments.`
        : `${CHAT_CONSTANTS.ASSISTANT_MESSAGES.BOOKING_SUCCESS_PREFIX}: ${booking.serviceName}${booking.staff ? ` with ${booking.staff.displayName}` : ""} on ${when} at ${booking.business.name}.`;
    const completed = await this.chat.completeBooking(userId, sessionId, {
      bookingId: booking.id,
      assistantContent: content,
      assistantStructuredData: {
        intent: "BOOK_APPOINTMENT",
        ...(session.bookingContext ? { bookingContext: session.bookingContext } : {}),
        missingFields: [],
        confirmationRequired: false,
        appointmentId: booking.id,
      },
    });

    return {
      session: completed.session,
      assistantMessage: completed.assistantMessage,
      appointment: this.bookings.toAppointmentResponse(completed.booking),
    };
  }

  private async processStructuredBookingDetails(
    userId: string,
    session: ChatSessionResponse,
    userMessage: ChatMessageResponse,
    details: StructuredBookingDetails,
    timeZone: string,
  ): Promise<ChatTurnResponse> {
    const scheduledAt = localDateTimeToUtc(
      details.scheduledDate,
      details.scheduledTime,
      timeZone,
    );

    if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
      throwRequestValidationError(
        "bookingDetails.scheduledDate",
        VALIDATION_MESSAGES.BOOKING_CONTEXT_TIME,
      );
    }

    const service = await this.catalog.findBookableService(
      session.business.id,
      details.serviceId,
    );

    if (!service) {
      throw new AppError(404, ERROR_CODES.SERVICE_NOT_FOUND, ERROR_MESSAGES.SERVICE_NOT_FOUND);
    }

    const notes = details.notes?.trim();
    const prepared = await this.prepareBooking(
      userId,
      session,
      {
        serviceName: service.name,
        scheduledAt,
        timeZone,
        ...(notes ? { notes } : {}),
      },
      service,
      details.staffId,
    );

    return this.saveTurn(userId, session, userMessage, {
      content: prepared.content,
      bookingContext: prepared.context,
      metadata: {
        intent: "BOOK_APPOINTMENT",
        bookingContext: prepared.context,
        missingFields: prepared.missingFields,
        confirmationRequired: prepared.confirmationRequired,
        ...(prepared.suggestedTimes ? { suggestedTimes: prepared.suggestedTimes } : {}),
      },
    });
  }

  /**
   * Holds the requested slot so it cannot be taken while the customer
   * confirms. An unchanged request keeps its existing hold; a taken slot
   * returns the nearest open times instead.
   */
  private async prepareBooking(
    userId: string,
    session: ChatSessionResponse,
    requested: AppointmentBookingContext,
    service: { id: string; name: string },
    staffId: string | undefined,
  ): Promise<PreparedChatBooking> {
    const previous = session.bookingContext;
    const scheduledAt = requested.scheduledAt as Date;
    const timeZone = requested.timeZone ?? "UTC";

    if (
      previous &&
      this.hasActiveHold(previous) &&
      previous.serviceId === service.id &&
      previous.scheduledAt?.getTime() === scheduledAt.getTime() &&
      (!staffId || previous.staffId === staffId)
    ) {
      return this.holdPrompt({ ...previous, ...(requested.notes ? { notes: requested.notes } : {}) });
    }

    await this.releaseChangedHold(userId, previous, null);

    try {
      const booking = await this.bookings.holdForUser({
        businessId: session.business.id,
        serviceId: service.id,
        startsAt: scheduledAt,
        userId,
        chatSessionId: null,
        notes: requested.notes ?? null,
        source: "CHAT",
        ...(staffId ? { staffId } : {}),
      });

      return this.holdPrompt({
        serviceName: booking.serviceName,
        serviceId: service.id,
        ...(booking.staff
          ? { staffId: booking.staff.id, staffName: booking.staff.displayName }
          : {}),
        holdBookingId: booking.id,
        ...(booking.holdExpiresAt ? { holdExpiresAt: booking.holdExpiresAt } : {}),
        ...(booking.priceMinor !== null ? { priceMinor: booking.priceMinor } : {}),
        ...(booking.currency ? { currency: booking.currency } : {}),
        scheduledAt: booking.scheduledAt,
        timeZone,
        durationMinutes: booking.durationMinutes,
        ...(requested.notes ? { notes: requested.notes } : {}),
      });
    } catch (error) {
      if (!this.isUnavailableSlotError(error)) throw error;

      const suggestedTimes = await this.bookings.suggestStartTimes(
        session.business.id,
        service.id,
        scheduledAt,
        BOOKING_CONSTANTS.ALTERNATIVE_SLOT_COUNT,
      );
      const requestedTime = this.formatDateTime(scheduledAt, timeZone);
      const content =
        suggestedTimes.length > 0
          ? `${service.name} isn't available on ${requestedTime}. The closest open times are ${suggestedTimes
              .map((time) => this.formatDateTime(time, timeZone))
              .join(", ")}. Which one would you like?`
          : CHAT_CONSTANTS.ASSISTANT_MESSAGES.NO_OPEN_TIMES;

      return {
        context: {
          serviceName: service.name,
          serviceId: service.id,
          timeZone,
          ...(requested.notes ? { notes: requested.notes } : {}),
        },
        content,
        missingFields: ["scheduledAt"],
        confirmationRequired: false,
        suggestedTimes,
      };
    }
  }

  private async explainUnknownService(
    userId: string,
    session: ChatSessionResponse,
    requested: AppointmentBookingContext,
  ): Promise<PreparedChatBooking> {
    await this.releaseChangedHold(userId, session.bookingContext, null);

    const names = await this.catalog.listBookableServiceNames(
      session.business.id,
      CHAT_CONSTANTS.SERVICE_SUGGESTION_COUNT,
    );
    const { serviceName, ...rest } = requested;

    return {
      context: rest,
      content:
        names.length > 0
          ? `I couldn't find “${serviceName ?? ""}” at ${session.business.name}. You can book ${names.join(", ")}. Which would you like?`
          : CHAT_CONSTANTS.ASSISTANT_MESSAGES.NO_ONLINE_SERVICES,
      missingFields: ["serviceName"],
      confirmationRequired: false,
    };
  }

  private holdPrompt(context: AppointmentBookingContext): PreparedChatBooking {
    const timeZone = context.timeZone ?? "UTC";
    const when = context.scheduledAt ? this.formatDateTime(context.scheduledAt, timeZone) : "";
    const price =
      context.priceMinor !== undefined && context.currency
        ? `, ${formatMinorAmount(context.priceMinor, context.currency)}`
        : "";
    const heldUntil = context.holdExpiresAt
      ? ` I'm holding it until ${this.formatTime(context.holdExpiresAt, timeZone)}.`
      : "";

    return {
      context,
      content: `${context.serviceName ?? "Your appointment"}${context.staffName ? ` with ${context.staffName}` : ""} on ${when} (${context.durationMinutes ?? ""} minutes${price}) is available.${heldUntil} ${CHAT_CONSTANTS.ASSISTANT_MESSAGES.CONFIRMATION_SUFFIX}`,
      missingFields: [],
      confirmationRequired: true,
    };
  }

  /** Releases the session's previous hold unless it is the one being kept. */
  private async releaseChangedHold(
    userId: string,
    previous: AppointmentBookingContext | null,
    keepBookingId: string | null,
  ): Promise<void> {
    const holdId = previous?.holdBookingId;

    if (!holdId || holdId === keepBookingId) return;

    const hold = await this.bookings.findHeldForUser(userId, holdId);

    if (hold) await this.bookings.releaseHold(hold, this.customer(userId));
  }

  private async saveTurn(
    userId: string,
    session: ChatSessionResponse,
    userMessage: ChatMessageResponse,
    turn: {
      content: string;
      bookingContext?: AppointmentBookingContext;
      metadata: ChatMessageMetadata;
    },
  ): Promise<ChatTurnResponse> {
    const persistedTurn = await this.chat.saveAssistantTurn(userId, session.id, {
      replyToMessageId: userMessage.id,
      content: turn.content,
      ...(turn.bookingContext ? { bookingContext: turn.bookingContext } : {}),
      structuredData: turn.metadata,
    });

    return {
      session: persistedTurn.session,
      userMessage,
      assistantMessage: persistedTurn.assistantMessage,
    };
  }

  private hasActiveHold(context: AppointmentBookingContext | null): boolean {
    return Boolean(
      context?.holdBookingId &&
        context.holdExpiresAt &&
        context.holdExpiresAt.getTime() > Date.now(),
    );
  }

  private isUnavailableSlotError(error: unknown): boolean {
    return (
      error instanceof AppError &&
      (error.code === ERROR_CODES.APPOINTMENT_SLOT_UNAVAILABLE ||
        (error.statusCode === 422 && Boolean(error.fieldErrors?.startsAt)))
    );
  }

  private customer(userId: string): BookingActor {
    return { type: "CUSTOMER", userId };
  }

  private toConversationHistory(
    messages: ChatMessageResponse[],
    currentUserMessageId: string,
  ): AiConversationMessage[] {
    return messages.flatMap((message) => {
      if (message.id === currentUserMessageId || message.role === "SYSTEM") {
        return [];
      }

      return [
        {
          role: message.role === "USER" ? "user" : "assistant",
          content: message.content,
        } as const,
      ];
    });
  }

  private toBookingContext(
    context: AiAppointmentContext,
    timeZone: string,
  ): AppointmentBookingContext {
    return {
      ...(context.serviceName ? { serviceName: context.serviceName } : {}),
      ...(context.scheduledAt ? { scheduledAt: context.scheduledAt } : {}),
      timeZone,
      ...(context.durationMinutes !== undefined
        ? { durationMinutes: context.durationMinutes }
        : {}),
      ...(context.notes ? { notes: context.notes } : {}),
    };
  }

  private toAiAppointmentContext(
    context: AppointmentBookingContext,
  ): AiAppointmentContext {
    return {
      ...(context.serviceName ? { serviceName: context.serviceName } : {}),
      ...(context.scheduledAt ? { scheduledAt: context.scheduledAt } : {}),
      ...(context.durationMinutes !== undefined
        ? { durationMinutes: context.durationMinutes }
        : {}),
      ...(context.notes ? { notes: context.notes } : {}),
    };
  }

  private buildNonBookingResponse(
    intent: AiAppointmentIntent,
    assistantReply: string | undefined,
  ): string {
    if (intent === "GREETING") {
      return assistantReply ?? CHAT_CONSTANTS.ASSISTANT_MESSAGES.GREETING;
    }

    if (intent === "BOOKING_HELP") {
      return assistantReply ?? CHAT_CONSTANTS.ASSISTANT_MESSAGES.BOOKING_HELP;
    }

    if (intent === "MANAGE_APPOINTMENT") {
      return CHAT_CONSTANTS.ASSISTANT_MESSAGES.MANAGE_APPOINTMENT;
    }

    return CHAT_CONSTANTS.ASSISTANT_MESSAGES.UNKNOWN_INTENT;
  }

  private getMissingBookingFields(
    context: AppointmentBookingContext | null,
  ): AiBookingField[] {
    const missingFields: AiBookingField[] = [];

    if (!context?.serviceName?.trim()) {
      missingFields.push("serviceName");
    }

    if (!context?.scheduledAt || context.scheduledAt.getTime() <= Date.now()) {
      missingFields.push("scheduledAt");
    }

    return missingFields;
  }

  private formatDateTime(value: Date, timeZone: string): string {
    return new Intl.DateTimeFormat(CHAT_CONSTANTS.RESPONSE_LOCALE, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(value);
  }

  private formatTime(value: Date, timeZone: string): string {
    return new Intl.DateTimeFormat(CHAT_CONSTANTS.RESPONSE_LOCALE, {
      timeStyle: "short",
      timeZone,
    }).format(value);
  }
}

export const chatOrchestrationService = new ChatOrchestrationService(
  aiService,
  chatService,
  bookingService,
  catalogService,
);
