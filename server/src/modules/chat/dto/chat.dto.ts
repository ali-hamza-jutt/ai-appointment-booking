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

/** A booking as shown inside the chat: a hold, a new booking or one being changed. */
export interface ChatBookingSummary {
  bookingId: string;
  serviceName: string;
  staffName: string | null;
  /** ISO 8601 instant. */
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  priceMinor: number | null;
  currency: string | null;
  status: string;
  /** ISO 8601 instant when a hold lapses; null once booked. */
  holdExpiresAt: string | null;
  timeZone: string;
}

export interface ChatDraftService {
  id: string;
  name: string;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
}

export interface ChatDraftStaff {
  id: string;
  displayName: string;
}

/**
 * The booking the customer is putting together. Each part references a real
 * row, so the draft can never describe a service or slot that does not exist.
 */
export interface ChatBookingDraft {
  service: ChatDraftService | null;
  staff: ChatDraftStaff | null;
  /** The held slot awaiting confirmation. */
  hold: ChatBookingSummary | null;
  timeZone: string | null;
  notes: string | null;
}

export interface ChatServiceCard {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
}

/** An offered start time; the token is what gets booked, so times cannot be invented. */
export interface ChatSlotOption {
  token: string;
  startsAt: string;
  endsAt: string;
  staffName: string | null;
  seatsLeft: number | null;
}

export interface SelectServiceAction {
  type: "select_service";
  serviceId: string;
  /** Show this provider's times only, for example a returning customer's usual one. */
  staffId?: string | undefined;
}

export interface SelectSlotAction {
  type: "select_slot";
  slotToken: string;
}

export interface ConfirmBookingAction {
  type: "confirm_booking";
}

export interface CancelBookingAction {
  type: "cancel_booking";
  bookingId: string;
}

export interface RescheduleBookingAction {
  type: "reschedule_booking";
  bookingId: string;
  slotToken: string;
}

/** What a tap on a card or button asks for; handled without the AI. */
export type ChatAction =
  | SelectServiceAction
  | SelectSlotAction
  | ConfirmBookingAction
  | CancelBookingAction
  | RescheduleBookingAction;

export interface ChatTextPart {
  type: "text";
  text: string;
}

export interface ChatServiceCardsPart {
  type: "service_cards";
  services: ChatServiceCard[];
}

export interface ChatSlotPickerPart {
  type: "slot_picker";
  serviceId: string;
  serviceName: string;
  timeZone: string;
  slots: ChatSlotOption[];
  /** Set when picking a slot moves this existing booking instead of making a new one. */
  rescheduleBookingId?: string;
}

export interface ChatBookingSummaryPart {
  type: "booking_summary";
  booking: ChatBookingSummary;
}

export interface ChatBookingListPart {
  type: "booking_list";
  bookings: ChatBookingSummary[];
}

export interface ChatConfirmPart {
  type: "confirm";
  label: string;
  description: string;
  tone: "primary" | "danger";
  action: ChatAction;
}

/** A link to Stripe Checkout for a booking waiting on its deposit or prepayment. */
export interface ChatPaymentLinkPart {
  type: "payment_link";
  label: string;
  url: string;
  amountMinor: number;
  currency: string;
  /** The link, and the held time, lapse together. */
  expiresAt: string;
}

/** Structured pieces of an assistant reply that the web renders as components. */
export type ChatMessagePart =
  | ChatTextPart
  | ChatServiceCardsPart
  | ChatSlotPickerPart
  | ChatBookingSummaryPart
  | ChatBookingListPart
  | ChatConfirmPart
  | ChatPaymentLinkPart;

export interface ChatMessageMetadata {
  intent?: "BOOK_APPOINTMENT" | "UNKNOWN";
  parts?: ChatMessagePart[];
  /** Fields the structured form still needs. */
  missingFields?: string[];
  /** True while a held slot is waiting for the customer to confirm. */
  confirmationRequired?: boolean;
  appointmentId?: string;
}

export interface ChatHandoff {
  requestedAt: Date;
  reason: string | null;
  resolvedAt: Date | null;
}

export interface CreateChatSessionRequest {
  /** @maxLength 120 */
  title?: string;

  /** Booking link of the business to book with. Defaults to the demo business. @maxLength 60 */
  businessSlug?: string;

  /** Abandons the active chat at this business before creating this session. */
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

  /** Form-provided values that bypass the assistant and are validated by the server. */
  bookingDetails?: StructuredBookingDetails;

  /** A tap on a card or button in an assistant reply; handled without the assistant. */
  action?: ChatAction;
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
  draft: ChatBookingDraft;
  /** Set when the assistant has asked staff to take over. */
  handoff: ChatHandoff | null;
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
  businessSlug?: string;
  cursor?: string;
  limit?: number;
}

export interface ListChatMessagesOptions {
  cursor?: string;
  limit?: number;
}

export interface ChatDraftHoldRecord {
  id: string;
  serviceName: string;
  scheduledAt: Date;
  endsAt: Date;
  durationMinutes: number;
  priceMinor: number | null;
  currency: string | null;
  status: string;
  holdExpiresAt: Date | null;
  timeZone: string;
  staff: { displayName: string } | null;
}

export interface ChatSessionRecord {
  id: string;
  business: ChatSessionBusiness;
  title: string | null;
  status: ChatSessionStatus;
  draftService: ChatDraftService | null;
  draftStaff: ChatDraftStaff | null;
  draftHold: ChatDraftHoldRecord | null;
  draftTimeZone: string | null;
  draftNotes: string | null;
  handoffRequestedAt: Date | null;
  handoffReason: string | null;
  handoffResolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Changes to a chat's draft; null clears a field, undefined leaves it. */
export interface ChatDraftPatch {
  serviceId?: string | null;
  staffId?: string | null;
  holdId?: string | null;
  timeZone?: string | null;
  notes?: string | null;
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
  replaceActive: boolean;
}

export interface ChatSessionPageCursor {
  id: string;
  updatedAt: Date;
}

export interface ListChatSessionsData {
  userId: string;
  status?: ChatSessionStatus;
  businessSlug?: string;
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
  structuredData: ChatMessageMetadata | null;
}

export interface ChatMessageCreationResult {
  message: ChatMessageResponse;
  created: boolean;
}

/** Where a chat's rolling summary stands. */
export interface ChatMemoryState {
  messageCount: number;
  summary: string | null;
  /** How many of the oldest messages the summary covers. */
  summarizedCount: number;
}

export interface ListChatMessageRangeData {
  userId: string;
  sessionId: string;
  skip: number;
  take: number;
}

export interface SaveChatSummaryData {
  userId: string;
  sessionId: string;
  summary: string;
  summarizedCount: number;
  /** The count the summary was built on; a newer summary wins a race. */
  previousCount: number;
}

export interface ListRecentChatMessagesData {
  userId: string;
  sessionId: string;
  take: number;
}

export interface SaveAssistantTurnRequest {
  replyToMessageId: string;
  content: string;
  draft?: ChatDraftPatch;
  structuredData: ChatMessageMetadata;
}

export interface SaveAssistantTurnData {
  userId: string;
  sessionId: string;
  replyToMessageId: string;
  content: string;
  draft?: ChatDraftPatch;
  structuredData: ChatMessageMetadata;
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
  assistantStructuredData: ChatMessageMetadata;
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

export interface UpdateChatDraftData {
  userId: string;
  sessionId: string;
  draft: ChatDraftPatch;
}
