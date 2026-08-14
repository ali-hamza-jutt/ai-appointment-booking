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
  notes: string;
  time: string;
  timezone: string;
  title: string;
}

export interface PendingChatTurn {
  clientMessageId: string;
  text: string;
}
