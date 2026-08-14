import type { BadgeTone } from "@/components/ui/badge";
import type {
  ChatMessageResponse,
  ChatSessionStatus,
} from "@/generated/api/models";

export type ConversationFilter = "ALL" | ChatSessionStatus;

export interface ConversationMessageViewModel {
  createdAt: string;
  createdAtLabel: string;
  id: string;
  role: "assistant" | "system" | "user";
  text: string;
  time: string;
}

export interface ChatMessagePollingOptions {
  enabled?: boolean;
  initialCursor?: string;
}

export interface ChatMessagePollingState {
  cursor?: string;
  items: ChatMessageResponse[];
}

export interface ConversationSessionViewModel {
  dateLabel: string;
  id: string;
  preview: string;
  status: ChatSessionStatus;
  statusLabel: string;
  statusTone: BadgeTone;
  title: string;
}
