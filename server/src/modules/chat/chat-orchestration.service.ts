import { randomUUID } from "node:crypto";

import { aiService } from "../../integrations/ai/ai.service.js";
import type {
  AiAppointmentContext,
  AiConversationMessage,
} from "../../integrations/ai/dto/ai.dto.js";
import {
  AI_CONSTANTS,
  APPOINTMENT_CONSTANTS,
  CHAT_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  VALIDATION_MESSAGES,
} from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import {
  localDateTimeToUtc,
  normalizeIanaTimeZone,
} from "../../utils/time-zone.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { appointmentService } from "../appointments/appointment.service.js";
import type {
  AppointmentBookingContext,
  ChatMessageMetadata,
  ChatMessageResponse,
  ChatTurnResponse,
  ConfirmChatBookingResponse,
  ProcessChatMessageRequest,
  StructuredBookingDetails,
} from "./dto/chat.dto.js";
import type {
  ChatOrchestrationAiPort,
  ChatOrchestrationAppointmentPort,
  ChatOrchestrationChatPort,
} from "./dto/chat-orchestration.dto.js";
import { chatService } from "./chat.service.js";

export class ChatOrchestrationService {
  public constructor(
    private readonly ai: ChatOrchestrationAiPort,
    private readonly chat: ChatOrchestrationChatPort,
    private readonly appointments: ChatOrchestrationAppointmentPort,
  ) {}

  public async processMessage(
    userId: string,
    sessionId: string,
    request: ProcessChatMessageRequest,
  ): Promise<ChatTurnResponse> {
    const timeZone = normalizeIanaTimeZone(request.timeZone);

    if (!timeZone) {
      throwRequestValidationError(
        "timeZone",
        VALIDATION_MESSAGES.AI_TIME_ZONE,
      );
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

    if (request.bookingDetails) {
      return this.processStructuredBookingDetails(
        userId,
        sessionId,
        userMessage,
        request.bookingDetails,
        timeZone,
      );
    }

    const [session, recentMessages] = await Promise.all([
      this.chat.getSession(userId, sessionId),
      this.chat.listRecentMessages(
        userId,
        sessionId,
        AI_CONSTANTS.HISTORY_QUERY_LIMIT,
      ),
    ]);

    if (session.status === "CLOSED") {
      throw new AppError(
        409,
        ERROR_CODES.CHAT_SESSION_CLOSED,
        ERROR_MESSAGES.CHAT_SESSION_CLOSED,
      );
    }

    const extraction = await this.ai.extractAppointmentDetails({
      userMessage: userMessage.content,
      conversationHistory: this.toConversationHistory(
        recentMessages,
        userMessage.id,
      ),
      ...(session.bookingContext
        ? { appointmentContext: session.bookingContext }
        : {}),
      timeZone,
    });
    const bookingContext = this.toBookingContext(
      extraction.appointmentContext,
    );
    const assistantContent = this.buildAssistantResponse(
      extraction.intent,
      bookingContext,
      extraction.clarificationQuestion,
      timeZone,
    );
    const metadata: ChatMessageMetadata = {
      intent: extraction.intent,
      ...(extraction.intent === "BOOK_APPOINTMENT"
        ? { bookingContext }
        : {}),
      missingFields: extraction.missingFields,
      confirmationRequired: extraction.confirmationRequired,
    };
    const persistedTurn = await this.chat.saveAssistantTurn(
      userId,
      sessionId,
      {
        replyToMessageId: userMessage.id,
        content: assistantContent,
        ...(extraction.intent === "BOOK_APPOINTMENT"
          ? { bookingContext }
          : {}),
        structuredData: metadata,
      },
    );

    return {
      session: persistedTurn.session,
      userMessage,
      assistantMessage: persistedTurn.assistantMessage,
    };
  }

  private async processStructuredBookingDetails(
    userId: string,
    sessionId: string,
    userMessage: ChatMessageResponse,
    details: StructuredBookingDetails,
    timeZone: string,
  ): Promise<ChatTurnResponse> {
    const session = await this.chat.getSession(userId, sessionId);

    if (session.status === "CLOSED") {
      throw new AppError(
        409,
        ERROR_CODES.CHAT_SESSION_CLOSED,
        ERROR_MESSAGES.CHAT_SESSION_CLOSED,
      );
    }

    const scheduledAt = localDateTimeToUtc(
      details.scheduledDate,
      details.scheduledTime,
      timeZone,
    );

    if (!scheduledAt) {
      throwRequestValidationError(
        "bookingDetails.scheduledDate",
        VALIDATION_MESSAGES.BOOKING_CONTEXT_TIME,
      );
    }

    const preparedAppointment = this.appointments.prepareAppointment({
      serviceName: details.serviceName,
      scheduledAt,
      ...(details.durationMinutes !== undefined
        ? { durationMinutes: details.durationMinutes }
        : {}),
      ...(details.notes !== undefined ? { notes: details.notes } : {}),
    });
    const bookingContext: AppointmentBookingContext = {
      serviceName: preparedAppointment.serviceName,
      scheduledAt: preparedAppointment.scheduledAt,
      durationMinutes: preparedAppointment.durationMinutes,
      ...(preparedAppointment.notes
        ? { notes: preparedAppointment.notes }
        : {}),
    };
    const persistedTurn = await this.chat.saveAssistantTurn(
      userId,
      sessionId,
      {
        replyToMessageId: userMessage.id,
        content: this.buildAssistantResponse(
          "BOOK_APPOINTMENT",
          bookingContext,
          undefined,
          timeZone,
        ),
        bookingContext,
        structuredData: {
          intent: "BOOK_APPOINTMENT",
          bookingContext,
          missingFields: [],
          confirmationRequired: true,
        },
      },
    );

    return {
      session: persistedTurn.session,
      userMessage,
      assistantMessage: persistedTurn.assistantMessage,
    };
  }

  public async confirmBooking(
    userId: string,
    sessionId: string,
  ): Promise<ConfirmChatBookingResponse> {
    const existingBooking = await this.chat.findConfirmedBooking(
      userId,
      sessionId,
    );

    if (existingBooking) {
      return {
        session: existingBooking.session,
        assistantMessage: existingBooking.assistantMessage,
        appointment: this.appointments.toResponse(
          existingBooking.appointment,
        ),
      };
    }

    const session = await this.chat.getSession(userId, sessionId);
    const context = session.bookingContext;

    if (!context?.serviceName || !context.scheduledAt) {
      throw new AppError(
        409,
        ERROR_CODES.CHAT_BOOKING_CONTEXT_INCOMPLETE,
        ERROR_MESSAGES.CHAT_BOOKING_CONTEXT_INCOMPLETE,
      );
    }

    const appointmentId = randomUUID();
    const preparedAppointment = this.appointments.prepareAppointment({
      serviceName: context.serviceName,
      scheduledAt: context.scheduledAt,
      ...(context.durationMinutes !== undefined
        ? { durationMinutes: context.durationMinutes }
        : {}),
      ...(context.notes !== undefined ? { notes: context.notes } : {}),
    });
    const bookingContext: AppointmentBookingContext = {
      serviceName: preparedAppointment.serviceName,
      scheduledAt: preparedAppointment.scheduledAt,
      durationMinutes: preparedAppointment.durationMinutes,
      ...(preparedAppointment.notes
        ? { notes: preparedAppointment.notes }
        : {}),
    };
    const assistantContent = this.buildBookingSuccessResponse(
      preparedAppointment.serviceName,
      preparedAppointment.scheduledAt,
    );
    const completedBooking = await this.chat.completeBooking(
      userId,
      sessionId,
      {
        appointmentId,
        ...preparedAppointment,
        assistantContent,
        assistantStructuredData: {
          intent: "BOOK_APPOINTMENT",
          bookingContext,
          missingFields: [],
          confirmationRequired: false,
          appointmentId,
        },
      },
    );

    return {
      session: completedBooking.session,
      assistantMessage: completedBooking.assistantMessage,
      appointment: this.appointments.toResponse(
        completedBooking.appointment,
      ),
    };
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
  ): AppointmentBookingContext {
    return {
      ...(context.serviceName ? { serviceName: context.serviceName } : {}),
      ...(context.scheduledAt ? { scheduledAt: context.scheduledAt } : {}),
      ...(context.durationMinutes !== undefined
        ? { durationMinutes: context.durationMinutes }
        : {}),
      ...(context.notes ? { notes: context.notes } : {}),
    };
  }

  private buildAssistantResponse(
    intent: "BOOK_APPOINTMENT" | "UNKNOWN",
    context: AppointmentBookingContext,
    clarificationQuestion: string | undefined,
    timeZone: string,
  ): string {
    if (intent === "UNKNOWN") {
      return CHAT_CONSTANTS.ASSISTANT_MESSAGES.UNKNOWN_INTENT;
    }

    if (clarificationQuestion) {
      return clarificationQuestion;
    }

    if (!context.serviceName || !context.scheduledAt) {
      throw new AppError(
        502,
        ERROR_CODES.AI_INVALID_RESPONSE,
        ERROR_MESSAGES.AI_INVALID_RESPONSE,
      );
    }

    const formattedTime = new Intl.DateTimeFormat(
      CHAT_CONSTANTS.RESPONSE_LOCALE,
      {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone,
      },
    ).format(context.scheduledAt);
    const duration =
      context.durationMinutes ?? APPOINTMENT_CONSTANTS.DEFAULT_DURATION_MINUTES;

    return `I have ${context.serviceName} for ${formattedTime} (${duration} minutes). ${CHAT_CONSTANTS.ASSISTANT_MESSAGES.CONFIRMATION_SUFFIX}`;
  }

  private buildBookingSuccessResponse(
    serviceName: string,
    scheduledAt: Date,
  ): string {
    return `${CHAT_CONSTANTS.ASSISTANT_MESSAGES.BOOKING_SUCCESS_PREFIX} for ${serviceName} at ${scheduledAt.toISOString()}.`;
  }
}

export const chatOrchestrationService = new ChatOrchestrationService(
  aiService,
  chatService,
  appointmentService,
);
