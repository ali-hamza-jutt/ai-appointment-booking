export interface ChatHandoffMessage {
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: Date;
}

/** A chat the assistant handed to staff. */
export interface ChatHandoffResponse {
  sessionId: string;
  customer: { name: string; email: string; phone: string | null };
  reason: string | null;
  requestedAt: Date;
  resolvedAt: Date | null;
  /** The last few messages, oldest first, for context. */
  recentMessages: ChatHandoffMessage[];
}

export interface ChatHandoffListResponse {
  items: ChatHandoffResponse[];
}
