import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import {
  AGENT_CONSTANTS,
  CHAT_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  REALTIME_CONSTANTS,
  VALIDATION_MESSAGES,
} from "../../constants/app.constants.js";
import { AgentRunner } from "../../integrations/ai/agent/agent-runner.js";
import type { AiAgentMessage, AiProvider } from "../../integrations/ai/dto/ai.dto.js";
import { InstrumentedAiProvider } from "../../integrations/ai/providers/instrumented.provider.js";
import { MistralProvider } from "../../integrations/ai/providers/mistral.provider.js";
import { AppError } from "../../middleware/app-error.js";
import { localDateTimeToUtc, normalizeIanaTimeZone } from "../../utils/time-zone.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { authDal } from "../auth/dal/auth.dal.js";
import { bookingService } from "../bookings/booking.service.js";
import type { BookingRecord } from "../bookings/dto/booking.dto.js";
import { catalogService } from "../catalog/catalog.service.js";
import {
  AssistantActionError,
  bookingAssistantService,
  type AssistantContext,
} from "./agent/booking-assistant.service.js";
import { buildBookingAgentPrompt } from "./agent/booking-agent.prompt.js";
import { bookingTools } from "./agent/booking-tools.js";
import { classifyLocalIntent } from "./agent/local-intent.js";
import { describeToolCall } from "./agent/tool-status.js";
import { publishChatEvent } from "./chat-events.js";
import { chatService } from "./chat.service.js";
import type {
  ChatMessageMetadata,
  ChatMessagePart,
  ChatMessageResponse,
  ChatSessionResponse,
  ChatTurnResponse,
  ConfirmChatBookingResponse,
  ProcessChatMessageRequest,
  StructuredBookingDetails,
} from "./dto/chat.dto.js";
import type { ChatTurnListener } from "./dto/chat-stream.dto.js";

interface AssistantReply {
  content: string;
  parts: ChatMessagePart[];
}

/**
 * Runs each chat turn. Typed actions (taps) and the structured form go
 * straight to booking core; free text goes to the tool-calling agent, with
 * greetings answered locally and a tap-to-book fallback when the AI is down.
 */
export class ChatOrchestrationService {
  private readonly runner: AgentRunner | null;

  public constructor(provider: AiProvider | null) {
    this.runner = provider ? new AgentRunner(provider) : null;
  }

  /**
   * Runs one turn and persists the reply once. With a listener, progress
   * (status lines, reply tokens, cards) is reported while the agent works.
   */
  public async processMessage(
    userId: string,
    sessionId: string,
    request: ProcessChatMessageRequest,
    listener?: ChatTurnListener,
  ): Promise<ChatTurnResponse> {
    const timeZone = normalizeIanaTimeZone(request.timeZone);

    if (!timeZone) {
      throwRequestValidationError("timeZone", VALIDATION_MESSAGES.AI_TIME_ZONE);
    }

    const userMessageResult = await chatService.createUserMessageWithStatus(userId, sessionId, request);
    const userMessage = userMessageResult.message;

    if (!userMessageResult.created) {
      const existingReply = await chatService.findAssistantReply(userId, sessionId, userMessage.id);

      if (existingReply) {
        return {
          session: await chatService.getSession(userId, sessionId),
          userMessage,
          assistantMessage: existingReply,
        };
      }
    }

    const session = await chatService.getSession(userId, sessionId);

    if (userMessageResult.created) {
      publishChatEvent({
        type: "message",
        sessionId,
        businessId: session.business.id,
        messageId: userMessage.id,
        role: "USER",
      });
    }

    if (session.status !== "ACTIVE") {
      throw new AppError(
        409,
        session.status === "CLOSED" ? ERROR_CODES.CHAT_SESSION_CLOSED : ERROR_CODES.CHAT_SESSION_NOT_ACTIVE,
        session.status === "CLOSED" ? ERROR_MESSAGES.CHAT_SESSION_CLOSED : ERROR_MESSAGES.CHAT_SESSION_NOT_ACTIVE,
      );
    }

    const context: AssistantContext = {
      userId,
      sessionId,
      business: session.business,
      timeZone,
      now: new Date(),
      draftHoldId: session.draft.hold?.bookingId,
    };
    const reply = request.action
      ? await this.handleAction(context, request.action)
      : request.bookingDetails
        ? await this.handleStructuredDetails(context, request.bookingDetails)
        : await this.handleText(context, session, userMessage, listener);

    return this.saveTurn(userId, sessionId, userMessage, reply);
  }

  public async confirmBooking(userId: string, sessionId: string): Promise<ConfirmChatBookingResponse> {
    const existingBooking = await chatService.findConfirmedBooking(userId, sessionId);

    if (existingBooking) {
      return {
        session: existingBooking.session,
        assistantMessage: existingBooking.assistantMessage,
        appointment: bookingService.toAppointmentResponse(existingBooking.booking),
      };
    }

    const session = await chatService.getSession(userId, sessionId);
    const holdId = session.draft.hold?.bookingId;
    const hold = holdId ? await bookingService.findHeldForUser(userId, holdId) : null;

    if (!hold) {
      throw new AppError(
        409,
        ERROR_CODES.CHAT_BOOKING_CONTEXT_INCOMPLETE,
        ERROR_MESSAGES.CHAT_BOOKING_CONTEXT_INCOMPLETE,
      );
    }

    const booking = await bookingService.confirmHold(hold, { type: "CUSTOMER", userId }, { chatSessionId: sessionId });
    const timeZone = session.draft.timeZone ?? booking.timeZone;
    const completed = await chatService.completeBooking(userId, sessionId, {
      bookingId: booking.id,
      assistantContent: this.confirmationMessage(booking, timeZone),
      assistantStructuredData: {
        intent: "BOOK_APPOINTMENT",
        confirmationRequired: false,
        appointmentId: booking.id,
        parts: [{ type: "booking_summary", booking: bookingAssistantService.toSummary(booking, timeZone) }],
      },
    });

    publishChatEvent({
      type: "message",
      sessionId,
      businessId: completed.session.business.id,
      messageId: completed.assistantMessage.id,
      role: "ASSISTANT",
    });
    publishChatEvent({
      type: "session",
      sessionId,
      businessId: completed.session.business.id,
      status: completed.session.status,
    });

    return {
      session: completed.session,
      assistantMessage: completed.assistantMessage,
      appointment: bookingService.toAppointmentResponse(completed.booking),
    };
  }

  private async handleAction(
    context: AssistantContext,
    action: NonNullable<ProcessChatMessageRequest["action"]>,
  ): Promise<AssistantReply> {
    try {
      return await bookingAssistantService.handleAction(context, action);
    } catch (error) {
      // A slot taken (or expired) between offer and tap gets fresh times rather than an error.
      if (error instanceof AssistantActionError && action.type === "select_slot") {
        const slot = bookingAssistantService.peekToken(context, action.slotToken);

        if (slot) {
          return bookingAssistantService.offerAlternatives(
            context,
            slot.serviceId,
            slot.staffId ?? undefined,
            bookingAssistantService.describeInstant(slot.startsAt, context.timeZone).date,
          );
        }

        return this.withServiceCards(context, "That time is no longer on offer. Pick a service to see current times.");
      }

      throw error;
    }
  }

  private async handleStructuredDetails(
    context: AssistantContext,
    details: StructuredBookingDetails,
  ): Promise<AssistantReply> {
    const startsAt = localDateTimeToUtc(details.scheduledDate, details.scheduledTime, context.timeZone);

    if (!startsAt || startsAt.getTime() <= Date.now()) {
      throwRequestValidationError("bookingDetails.scheduledDate", VALIDATION_MESSAGES.BOOKING_CONTEXT_TIME);
    }

    const service = await catalogService.findBookableService(context.business.id, details.serviceId);

    if (!service) {
      throw new AppError(404, ERROR_CODES.SERVICE_NOT_FOUND, ERROR_MESSAGES.SERVICE_NOT_FOUND);
    }

    const session = await chatService.getSession(context.userId, context.sessionId);
    let hold: BookingRecord;

    try {
      hold = await bookingService.holdForUser({
        businessId: context.business.id,
        serviceId: service.id,
        startsAt,
        userId: context.userId,
        chatSessionId: null,
        notes: details.notes?.trim() || null,
        source: "FORM",
        ...(details.staffId ? { staffId: details.staffId } : {}),
      });
    } catch (error) {
      if (!(error instanceof AppError) || error.statusCode !== 409) throw error;

      return bookingAssistantService.offerAlternatives(
        context,
        service.id,
        details.staffId,
        details.scheduledDate,
      );
    }

    const previousHold = session.draft.hold?.bookingId;

    if (previousHold && previousHold !== hold.id) {
      const previous = await bookingService.findHeldForUser(context.userId, previousHold);

      if (previous) await bookingService.releaseHold(previous, { type: "CUSTOMER", userId: context.userId });
    }

    await chatService.updateDraft(context.userId, context.sessionId, {
      serviceId: service.id,
      staffId: hold.staff?.id ?? null,
      holdId: hold.id,
      timeZone: context.timeZone,
      notes: hold.notes,
    });

    const summary = bookingAssistantService.toSummary(hold, context.timeZone);

    return {
      content: bookingAssistantService.holdMessage(summary),
      parts: [
        { type: "booking_summary", booking: summary },
        { type: "confirm", label: "Confirm booking", description: "Book this time.", tone: "primary", action: { type: "confirm_booking" } },
      ],
    };
  }

  private async handleText(
    context: AssistantContext,
    session: ChatSessionResponse,
    userMessage: ChatMessageResponse,
    listener?: ChatTurnListener,
  ): Promise<AssistantReply> {
    const localIntent = classifyLocalIntent(userMessage.content);

    if (localIntent) {
      return this.withServiceCards(
        context,
        localIntent === "GREETING"
          ? CHAT_CONSTANTS.ASSISTANT_MESSAGES.GREETING
          : CHAT_CONSTANTS.ASSISTANT_MESSAGES.BOOKING_HELP,
      );
    }

    if (!this.runner) {
      return this.withServiceCards(context, CHAT_CONSTANTS.ASSISTANT_MESSAGES.ASSISTANT_UNAVAILABLE);
    }

    const [recentMessages, user] = await Promise.all([
      chatService.listRecentMessages(context.userId, context.sessionId, env.AI_MAX_HISTORY_MESSAGES + 1),
      authDal.findUserById(context.userId),
    ]);

    listener?.status(REALTIME_CONSTANTS.STATUS.THINKING);

    try {
      const result = await this.runner.run({
        systemPrompt: buildBookingAgentPrompt({
          businessName: context.business.name,
          customerName: user?.fullName.split(/\s+/)[0] ?? "the customer",
          timeZone: context.timeZone,
          now: context.now,
          draft: session.draft,
        }),
        history: this.toAgentHistory(recentMessages, userMessage),
        tools: bookingTools,
        context,
        businessId: context.business.id,
        ...(listener
          ? {
              listener: {
                token: (text: string) => listener.token(text),
                toolCall: (name: string, args: unknown) => listener.status(describeToolCall(name, args)),
                parts: (parts: ChatMessagePart[]) => parts.forEach((part) => listener.part(part)),
              },
            }
          : {}),
      });

      logger.info(
        {
          businessId: context.business.id,
          rounds: result.rounds,
          tools: result.toolCalls.map((call) => `${call.name}${call.ok ? "" : `!${call.error ?? ""}`}`),
          tokens: result.usage.totalTokens,
        },
        "Booking agent turn completed",
      );

      return {
        content: result.text.trim() || CHAT_CONSTANTS.ASSISTANT_MESSAGES.EMPTY_REPLY,
        parts: this.dedupeParts(result.parts),
      };
    } catch (error) {
      if (!(error instanceof AppError) || error.statusCode < 500) throw error;

      logger.warn({ code: error.code }, "Booking agent unavailable; offering tap-to-book");

      return this.withServiceCards(context, CHAT_CONSTANTS.ASSISTANT_MESSAGES.ASSISTANT_UNAVAILABLE);
    }
  }

  private async withServiceCards(context: AssistantContext, content: string): Promise<AssistantReply> {
    const result = await bookingAssistantService.searchServices(context);

    return {
      content: result.parts?.length ? content : CHAT_CONSTANTS.ASSISTANT_MESSAGES.NO_ONLINE_SERVICES,
      parts: result.parts ?? [],
    };
  }

  /**
   * Prior turns as plain text. Times offered earlier are listed with their
   * tokens so the customer can pick one without another availability call.
   */
  private toAgentHistory(messages: ChatMessageResponse[], current: ChatMessageResponse): AiAgentMessage[] {
    const history = messages.flatMap((message): AiAgentMessage[] => {
      if (message.id === current.id || message.role === "SYSTEM") return [];
      if (message.role === "USER") return [{ role: "user", content: message.content }];

      const offered = (message.structuredData?.parts ?? [])
        .flatMap((part) => (part.type === "slot_picker" ? part.slots : []))
        .slice(0, AGENT_CONSTANTS.MAX_SLOTS_SHOWN)
        .map((slot) => `${slot.startsAt} token=${slot.token}`);

      return [
        {
          role: "assistant",
          content: offered.length > 0 ? `${message.content}\n[Times offered: ${offered.join("; ")}]` : message.content,
        },
      ];
    });

    return [...history, { role: "user", content: current.content }];
  }

  /**
   * Several tool calls can show the same card; keep the last of each kind.
   * Once something is ready to confirm, the cards that led there are noise.
   */
  private dedupeParts(parts: ChatMessagePart[]): ChatMessagePart[] {
    const hasProposal = parts.some((part) => part.type === "confirm");
    const kept = hasProposal
      ? parts.filter((part) => part.type === "booking_summary" || part.type === "confirm")
      : parts;
    const lastIndex = new Map(kept.map((part, index) => [part.type, index]));

    return kept.filter((part, index) => lastIndex.get(part.type) === index);
  }

  private async saveTurn(
    userId: string,
    sessionId: string,
    userMessage: ChatMessageResponse,
    reply: AssistantReply,
  ): Promise<ChatTurnResponse> {
    const draftHasHold = reply.parts.some(
      (part) => part.type === "confirm" && part.action.type === "confirm_booking",
    );
    const structuredData: ChatMessageMetadata = {
      intent: "BOOK_APPOINTMENT",
      confirmationRequired: draftHasHold,
      ...(reply.parts.length > 0 ? { parts: reply.parts } : {}),
    };
    const persisted = await chatService.saveAssistantTurn(userId, sessionId, {
      replyToMessageId: userMessage.id,
      content: reply.content,
      structuredData,
    });

    publishChatEvent({
      type: "message",
      sessionId,
      businessId: persisted.session.business.id,
      messageId: persisted.assistantMessage.id,
      role: "ASSISTANT",
    });

    return { session: persisted.session, userMessage, assistantMessage: persisted.assistantMessage };
  }

  private confirmationMessage(booking: BookingRecord, timeZone: string): string {
    const when = new Intl.DateTimeFormat(CHAT_CONSTANTS.RESPONSE_LOCALE, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(booking.scheduledAt);

    return booking.status === "PENDING"
      ? `${CHAT_CONSTANTS.ASSISTANT_MESSAGES.BOOKING_PENDING_PREFIX}: ${booking.serviceName} on ${when} at ${booking.business.name}. You'll see it confirmed in My appointments.`
      : `${CHAT_CONSTANTS.ASSISTANT_MESSAGES.BOOKING_SUCCESS_PREFIX}: ${booking.serviceName}${booking.staff ? ` with ${booking.staff.displayName}` : ""} on ${when} at ${booking.business.name}.`;
  }
}

const mistralProvider = env.MISTRAL_API_KEY
  ? new InstrumentedAiProvider(
      new MistralProvider({
        apiKey: env.MISTRAL_API_KEY,
        model: env.MISTRAL_MODEL,
        apiUrl: env.MISTRAL_API_URL,
        timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
      }),
    )
  : null;

export const chatOrchestrationService = new ChatOrchestrationService(mistralProvider);
