export interface ConversationMessageViewModel {
  id: string;
  role: "assistant" | "user";
  text: string;
  time: string;
}

export interface ConversationViewModel {
  dateLabel: string;
  id: string;
  messages: ConversationMessageViewModel[];
  preview: string;
  statusLabel: string;
  title: string;
}
