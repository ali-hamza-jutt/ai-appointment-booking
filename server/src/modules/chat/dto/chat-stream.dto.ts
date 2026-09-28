import type { ChatMessagePart, ChatTurnResponse } from "./chat.dto.js";

/** Progress of one chat turn, for streaming it to the customer. */
export interface ChatTurnListener {
  /** What the assistant is doing; any reply text streamed so far is superseded. */
  status(text: string): void;
  /** Reply text as it is written. */
  token(text: string): void;
  /** A card or button, before the reply is final. */
  part(part: ChatMessagePart): void;
}

/**
 * Events on POST /chat/sessions/{id}/messages with Accept: text/event-stream.
 * `done` carries the persisted turn and is the only thing to keep; the rest
 * is progress. `error` ends the stream in place of `done`.
 */
export type ChatStreamEvent =
  | { event: "status"; data: { text: string } }
  | { event: "token"; data: { text: string } }
  | { event: "part"; data: { part: ChatMessagePart } }
  | { event: "done"; data: ChatTurnResponse }
  | { event: "error"; data: { statusCode: number; code: string; message: string; fieldErrors?: Record<string, string[]> } };

/** Change notices on the session and business event streams; clients refetch on them. */
export type ChatRealtimeEvent =
  | { type: "message"; sessionId: string; businessId: string; messageId: string; role: "USER" | "ASSISTANT" }
  | { type: "session"; sessionId: string; businessId: string; status: string }
  | { type: "handoff"; sessionId: string; businessId: string; state: "requested" | "resolved" };

/** A booking at the business changed; the dashboard refetches its calendar. */
export interface BookingRealtimeEvent {
  type: "booking";
  businessId: string;
  bookingId: string;
  status: string;
}

/** Everything on a business's event stream. */
export type BusinessRealtimeEvent = ChatRealtimeEvent | BookingRealtimeEvent;
