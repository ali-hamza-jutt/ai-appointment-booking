import type {
  AppointmentResponse,
  BookingRecord,
} from "../../bookings/dto/booking.dto.js";

export type ChatSessionStatus = "ACTIVE" | "CLOSED" | "ABANDONED";

export type ChatMessageRole = "USER" | "ASSISTANT" | "SYSTEM";

/**
 * @pattern ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ Must be a valid UUID
 */
export type ClientMessageId = string;

export interface AppointmentBookingContext {
  /** @minLength 2 @maxLength 120 */
  serviceName?: string;

  /** Catalog service the request was matched to. */
  serviceId?: string;

  /** Staff member holding the slot. */
  staffId?: string;

  staffName?: string;

  /** The held booking awaiting confirmation. */
  holdBookingId?: string;

  holdExpiresAt?: Date;

  priceMinor?: number;

  currency?: string;

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
  /** Open start times offered when the requested time was taken. */
  suggestedTimes?: Date[];
}

export interface StoredAppointmentBookingContext {
  serviceName?: string;
  serviceId?: string;
  staffId?: string;
  staffName?: string;
  holdBookingId?: string;
  holdExpiresAt?: string;
  priceMinor?: number;
  currency?: string;
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
  suggestedTimes?: string[];
}

export interface CreateChatSessionRequest {
  /** @maxLength 120 */
  title?: string;

  /** Booking link of the business to book with. Defaults to the demo business. @maxLength 60 */
  businessSlug?: string;

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
  serviceId: string;

  /** Omit to take any available staff member. */
  staffId?: string;

  /** @pattern ^\d{4}-\d{2}-\d{2}$ Must use YYYY-MM-DD */
  scheduledDate: string;

  /** @pattern ^(?:[01]\d|2[0-3]):[0-5]\d$ Must use HH:mm in 24-hour time */
  scheduledTime: string;

  /** @maxLength 2000 */
  notes?: string;
}

export interface ProcessChatMessageRequest extends CreateChatMessageRequest {
  /** IANA time zone used to interpret relative dates such as tomorrow. @maxLength 100 */
  timeZone: string;

  /** Form-provided values that bypass AI extraction and are validated by the server. */
  bookingDetails?: StructuredBookingDetails;
}

export interface ChatSessionBusiness {
  id: string;
  name: string;
  slug: string;
}

export interface ChatSessionResponse {
  id: string;
  business: ChatSessionBusiness;
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
  business: ChatSessionBusiness;
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
  businessId: string;
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
  bookingId: string;
  assistantContent: string;
  assistantStructuredData: StoredChatMessageMetadata;
}

export interface CompleteChatBookingRequest {
  bookingId: string;
  assistantContent: string;
  assistantStructuredData: ChatMessageMetadata;
}

export interface ConfirmedChatBookingRecord extends ChatSessionRecord {
  booking: BookingRecord | null;
  messages: ChatMessageRecord[];
}

export interface ChatBookingPersistenceResult {
  session: ChatSessionResponse;
  assistantMessage: ChatMessageResponse;
  booking: BookingRecord;
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
