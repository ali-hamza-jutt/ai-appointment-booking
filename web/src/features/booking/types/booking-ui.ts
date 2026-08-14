export type ChatMessageRole = "assistant" | "user";

export interface ChatMessageViewModel {
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
