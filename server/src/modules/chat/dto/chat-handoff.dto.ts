export interface ChatHandoffMessage {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  /** The staff member who wrote an ASSISTANT message; null when the assistant did. */
  sentBy: string | null;
  createdAt: Date;
}

/** A chat the assistant handed to staff. */
export interface ChatHandoffResponse {
  sessionId: string;
  /** Where the customer is chatting; replies to SMS and WhatsApp chats are also texted to them. */
  channel: "WEB" | "WIDGET" | "WHATSAPP" | "SMS";
  /** email is null for people who have only texted. */
  customer: { name: string; email: string | null; phone: string | null };
  reason: string | null;
  requestedAt: Date;
  resolvedAt: Date | null;
  /** The last few messages, oldest first, for context. */
  recentMessages: ChatHandoffMessage[];
}

export interface ChatHandoffListResponse {
  items: ChatHandoffResponse[];
}

/** A handed-off chat in full, for reading and replying. */
export interface ChatHandoffThreadResponse extends Omit<ChatHandoffResponse, "recentMessages"> {
  /** Oldest first; the most recent 100. */
  messages: ChatHandoffMessage[];
}

export interface ReplyToHandoffRequest {
  /** @minLength 1 @maxLength 4000 */
  content: string;
}
