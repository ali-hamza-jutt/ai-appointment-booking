import type { ConversationFilter } from "@/features/conversations/types/conversation-ui";

export const CONVERSATION_UI_CONSTANTS = {
  FILTERS: [
    { label: "All", value: "ALL" },
    { label: "Active", value: "ACTIVE" },
    { label: "Closed", value: "CLOSED" },
  ] satisfies ReadonlyArray<{ label: string; value: ConversationFilter }>,
  MESSAGE_PAGE_SIZE: 50,
  RESUME_MESSAGE_PAGE_SIZE: 100,
  SESSION_PAGE_SIZE: 20,
} as const;
