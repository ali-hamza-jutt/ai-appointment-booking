import type {
  AppointmentExtractionResult,
  ExtractAppointmentRequest,
} from "../../../integrations/ai/dto/ai.dto.js";
import type {
  AppointmentResponse,
  CreateAppointmentRequest,
  PreparedAppointment,
} from "../../appointments/dto/appointment.dto.js";
import type {
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

export interface ChatOrchestrationAppointmentPort {
  prepareAppointment(request: CreateAppointmentRequest): PreparedAppointment;
  toResponse(
    appointment: ChatBookingPersistenceResult["appointment"],
  ): AppointmentResponse;
}
