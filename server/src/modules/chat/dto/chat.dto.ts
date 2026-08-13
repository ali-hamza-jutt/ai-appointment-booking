export type ChatSessionStatus = "ACTIVE" | "CLOSED";

export type ChatMessageRole = "USER" | "ASSISTANT" | "SYSTEM";

/**
 * @pattern ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ Must be a valid UUID
 */
export type ClientMessageId = string;

export interface AppointmentBookingContext {
  /** @minLength 2 @maxLength 120 */
  serviceName?: string;

  scheduledAt?: Date;

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
}

export interface CreateChatMessageRequest {
  clientMessageId: ClientMessageId;

  /** @minLength 1 @maxLength 4000 */
  content: string;
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
  role: ChatMessageRole;
  content: string;
  structuredData: ChatMessageMetadata | null;
  createdAt: Date;
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
  role: ChatMessageRole;
  content: string;
  structuredData: unknown;
  createdAt: Date;
}

export interface CreateChatSessionData {
  userId: string;
  title: string | null;
  bookingContext: StoredAppointmentBookingContext | null;
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
  role: ChatMessageRole;
  content: string;
  structuredData: StoredChatMessageMetadata | null;
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
