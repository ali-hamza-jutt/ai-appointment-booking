import type {
  AppointmentExtractionResult,
  ExtractAppointmentRequest,
} from "../../../integrations/ai/dto/ai.dto.js";
import type {
  AppointmentResponse,
  BookingActor,
  BookingRecord,
} from "../../bookings/dto/booking.dto.js";
import type {
  AppointmentBookingContext,
  AssistantTurnPersistenceResult,
  ChatBookingPersistenceResult,
  ChatMessageCreationResult,
  ChatMessageResponse,
  ChatSessionResponse,
  CompleteChatBookingRequest,
  CreateChatMessageRequest,
  SaveAssistantTurnRequest,
} from "./chat.dto.js";

export interface ChatOrchestrationAiPort {
  extractAppointmentDetails(
    request: ExtractAppointmentRequest,
  ): Promise<AppointmentExtractionResult>;
}

export interface ChatOrchestrationChatPort {
  createUserMessageWithStatus(
    userId: string,
    sessionId: string,
    request: CreateChatMessageRequest,
  ): Promise<ChatMessageCreationResult>;

  findAssistantReply(
    userId: string,
    sessionId: string,
    userMessageId: string,
  ): Promise<ChatMessageResponse | null>;

  getSession(userId: string, sessionId: string): Promise<ChatSessionResponse>;

  listRecentMessages(
    userId: string,
    sessionId: string,
    limit: number,
  ): Promise<ChatMessageResponse[]>;

  saveAssistantTurn(
    userId: string,
    sessionId: string,
    request: SaveAssistantTurnRequest,
  ): Promise<AssistantTurnPersistenceResult>;

  findConfirmedBooking(
    userId: string,
    sessionId: string,
  ): Promise<ChatBookingPersistenceResult | null>;

  completeBooking(
    userId: string,
    sessionId: string,
    request: CompleteChatBookingRequest,
  ): Promise<ChatBookingPersistenceResult>;
}

export interface ChatOrchestrationBookingPort {
  holdForUser(input: {
    businessId: string;
    serviceId: string;
    staffId?: string;
    startsAt: Date;
    userId: string;
    chatSessionId: string | null;
    notes: string | null;
    source: "FORM" | "CHAT";
  }): Promise<BookingRecord>;
  confirmHold(
    booking: BookingRecord,
    actor: BookingActor,
    extraPatch?: { chatSessionId?: string },
  ): Promise<BookingRecord>;
  releaseHold(booking: BookingRecord, actor: BookingActor): Promise<void>;
  findHeldForUser(userId: string, bookingId: string): Promise<BookingRecord | null>;
  suggestStartTimes(
    businessId: string,
    serviceId: string,
    from: Date,
    count: number,
  ): Promise<Date[]>;
  toAppointmentResponse(booking: BookingRecord): AppointmentResponse;
}

export interface ChatOrchestrationCatalogPort {
  findBookableService(
    businessId: string,
    serviceId: string,
  ): Promise<{ id: string; name: string } | null>;
  matchServiceByName(
    businessId: string,
    name: string,
  ): Promise<{ id: string; name: string } | null>;
  listBookableServiceNames(businessId: string, limit: number): Promise<string[]>;
}

/** Result of turning a complete request into a held slot, or explaining why not. */
export interface PreparedChatBooking {
  context: AppointmentBookingContext;
  content: string;
  missingFields: string[];
  confirmationRequired: boolean;
  suggestedTimes?: Date[];
}
