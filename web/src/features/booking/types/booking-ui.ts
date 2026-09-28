import type { ChatAction, ChatMessagePart } from "@/generated/api/models";

export type ChatMessageRole = "assistant" | "user";
export type ChatMessageDeliveryStatus = "sending" | "sent" | "failed";

export interface ChatMessageViewModel {
  clientMessageId?: string;
  deliveryStatus?: ChatMessageDeliveryStatus;
  id: string;
  /** Cards and buttons that come with an assistant reply. */
  parts?: ChatMessagePart[];
  role: ChatMessageRole;
  /** First name of the staff member who wrote an assistant message, when a person did. */
  sentBy?: string;
  text: string;
}

export interface BookingDraftViewModel {
  date: string;
  duration: string;
  /** Local time the hold lapses, when a slot is being held. */
  heldUntil: string | null;
  notes: string;
  price: string | null;
  staff: string | null;
  time: string;
  timezone: string;
  title: string;
}

export interface PendingChatTurn {
  /** A tap on a card or button, sent instead of free text. */
  action?: ChatAction;
  bookingDetails?: StructuredBookingFormValues;
  clientMessageId: string;
  text: string;
}

export interface StructuredBookingFormValues {
  notes?: string;
  scheduledDate: string;
  scheduledTime: string;
  serviceId: string;
  staffId?: string;
}

/** An assistant reply while it streams in, before it is saved. */
export interface LiveReplyViewModel {
  /** What the assistant is doing right now, such as "Checking Thursday…". */
  status: string | null;
  text: string;
  parts: ChatMessagePart[];
}
