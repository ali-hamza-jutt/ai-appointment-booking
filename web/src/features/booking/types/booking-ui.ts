export type ChatMessageRole = "assistant" | "user";
export type ChatMessageDeliveryStatus = "sending" | "sent" | "failed";

export interface ChatMessageViewModel {
  clientMessageId?: string;
  deliveryStatus?: ChatMessageDeliveryStatus;
  id: string;
  role: ChatMessageRole;
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
