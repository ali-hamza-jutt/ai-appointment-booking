import type {
  AppointmentRecord,
  AppointmentResponse,
} from "../../appointments/dto/appointment.dto.js";

export type ChatSessionStatus = "ACTIVE" | "CLOSED" | "ABANDONED";

export type ChatMessageRole = "USER" | "ASSISTANT" | "SYSTEM";

/**
 * @pattern ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ Must be a valid UUID
 */
export type ClientMessageId = string;

export interface AppointmentBookingContext {
  /** @minLength 2 @maxLength 120 */
  serviceName?: string;

  scheduledAt?: Date;

  /** IANA time zone used to interpret the scheduled date and time. @maxLength 100 */
  timeZone?: string;

  /**
   * @isInt Duration must be a whole number
   * @minimum 5
   * @maximum 480
   */
  durationMinutes?: number;

  /** @maxLength 2000 */
  notes?: string;
}

export interface ChatMessageMetadata {
  intent?: "BOOK_APPOINTMENT" | "UNKNOWN";
  bookingContext?: AppointmentBookingContext;
  missingFields?: string[];
  confirmationRequired?: boolean;
  appointmentId?: string;
}

export interface StoredAppointmentBookingContext {
  serviceName?: string;
  scheduledAt?: string;
  timeZone?: string;
  durationMinutes?: number;
  notes?: string;
}

export interface StoredChatMessageMetadata {
  intent?: "BOOK_APPOINTMENT" | "UNKNOWN";
  bookingContext?: StoredAppointmentBookingContext;
  missingFields?: string[];
  confirmationRequired?: boolean;
  appointmentId?: string;
}

export interface CreateChatSessionRequest {
  /** @maxLength 120 */
  title?: string;

  bookingContext?: AppointmentBookingContext;

  /** Abandons the current active chat before creating this session. */
  replaceActive?: boolean;
}

export interface CreateChatMessageRequest {
  clientMessageId: ClientMessageId;

  /** @minLength 1 @maxLength 4000 */
  content: string;
}

export interface StructuredBookingDetails {
  /** @minLength 2 @maxLength 120 */
  serviceName: string;

  /** @pattern ^\d{4}-\d{2}-\d{2}$ Must use YYYY-MM-DD */
  scheduledDate: string;

  /** @pattern ^(?:[01]\d|2[0-3]):[0-5]\d$ Must use HH:mm in 24-hour time */
  scheduledTime: string;

  /**
   * @isInt Duration must be a whole number
   * @minimum 5
   * @maximum 480
   */
  durationMinutes?: number;

  /** @maxLength 2000 */
  notes?: string;
}

export interface ProcessChatMessageRequest extends CreateChatMessageRequest {
  /** IANA time zone used to interpret relative dates such as tomorrow. @maxLength 100 */
  timeZone: string;

  /** Form-provided values that bypass AI extraction and are validated by the server. */
  bookingDetails?: StructuredBookingDetails;
}

export interface ChatSessionResponse {
  id: string;
  title: string | null;
  status: ChatSessionStatus;
  bookingContext: AppointmentBookingContext | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatSessionListResponse {
  items: ChatSessionResponse[];
  nextCursor?: string;
}

export interface ChatMessageResponse {
  id: string;
  sessionId: string;
  clientMessageId: string | null;
  replyToMessageId: string | null;
  role: ChatMessageRole;
  content: string;
  structuredData: ChatMessageMetadata | null;
  createdAt: Date;
}

export interface ChatTurnResponse {
  session: ChatSessionResponse;
  userMessage: ChatMessageResponse;
  assistantMessage: ChatMessageResponse;
}

export interface ConfirmChatBookingResponse {
  session: ChatSessionResponse;
  assistantMessage: ChatMessageResponse;
  appointment: AppointmentResponse;
}

export interface ChatMessageListResponse {
  items: ChatMessageResponse[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface ListChatSessionsOptions {
  status?: ChatSessionStatus;
  cursor?: string;
  limit?: number;
}

export interface ListChatMessagesOptions {
  cursor?: string;
  limit?: number;
}

export interface ChatSessionRecord {
  id: string;
  title: string | null;
  status: ChatSessionStatus;
  bookingContext: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  clientMessageId: string | null;
  replyToMessageId: string | null;
  role: ChatMessageRole;
  content: string;
  structuredData: unknown;
  createdAt: Date;
}

export interface CreateChatSessionData {
  userId: string;
  title: string | null;
  bookingContext: StoredAppointmentBookingContext | null;
  replaceActive: boolean;
}

export interface ChatSessionPageCursor {
  id: string;
  updatedAt: Date;
}

export interface ListChatSessionsData {
  userId: string;
  status?: ChatSessionStatus;
  cursor?: ChatSessionPageCursor;
  take: number;
}

export interface CreateChatMessageData {
  userId: string;
  sessionId: string;
  clientMessageId: string | null;
  replyToMessageId: string | null;
  role: ChatMessageRole;
  content: string;
  structuredData: StoredChatMessageMetadata | null;
}

export interface ChatMessageCreationResult {
  message: ChatMessageResponse;
  created: boolean;
}

export interface ListRecentChatMessagesData {
  userId: string;
  sessionId: string;
  take: number;
}

export interface SaveAssistantTurnRequest {
  replyToMessageId: string;
  content: string;
  bookingContext?: AppointmentBookingContext;
  structuredData: ChatMessageMetadata;
}

export interface SaveAssistantTurnData {
  userId: string;
  sessionId: string;
  replyToMessageId: string;
  content: string;
  bookingContext?: StoredAppointmentBookingContext;
  structuredData: StoredChatMessageMetadata;
}

export interface ChatSessionWithMessagesRecord extends ChatSessionRecord {
  messages: ChatMessageRecord[];
}

export interface AssistantTurnPersistenceResult {
  session: ChatSessionResponse;
  assistantMessage: ChatMessageResponse;
}

export interface ConfirmChatBookingData {
  userId: string;
  sessionId: string;
  appointmentId: string;
  serviceName: string;
  scheduledAt: Date;
  timeZone: string;
  durationMinutes: number;
  notes: string | null;
  assistantContent: string;
  assistantStructuredData: StoredChatMessageMetadata;
}

export interface CompleteChatBookingRequest {
  appointmentId: string;
  serviceName: string;
  scheduledAt: Date;
  timeZone: string;
  durationMinutes: number;
  notes: string | null;
  assistantContent: string;
  assistantStructuredData: ChatMessageMetadata;
}

export interface ConfirmedChatBookingRecord extends ChatSessionRecord {
  appointment: AppointmentRecord | null;
  messages: ChatMessageRecord[];
}

export interface ChatBookingPersistenceResult {
  session: ChatSessionResponse;
  assistantMessage: ChatMessageResponse;
  appointment: AppointmentRecord;
}

export interface ChatMessagePageCursor {
  id: string;
  createdAt: Date;
}

export interface ListChatMessagesData {
  userId: string;
  sessionId: string;
  cursor?: ChatMessagePageCursor;
  take: number;
}

export interface UpdateBookingContextData {
  userId: string;
  sessionId: string;
  bookingContext: StoredAppointmentBookingContext;
}
