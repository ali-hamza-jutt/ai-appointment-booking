"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { CONVERSATION_UI_CONSTANTS } from "@/features/conversations/constants/conversation-ui.constants";
import {
  getListMessagesQueryKey,
  listMessages,
} from "@/generated/api/chat/chat";
import type {
  ChatMessageListResponse,
  ListMessagesParams,
} from "@/generated/api/models";

interface ConversationMessageQueryOptions {
  enabled?: boolean;
  limit?: number;
}

export function useConversationMessages(
  sessionId: string,
  {
    enabled = true,
    limit = CONVERSATION_UI_CONSTANTS.MESSAGE_PAGE_SIZE,
  }: ConversationMessageQueryOptions = {},
) {
  const baseParams: ListMessagesParams = { limit };

  return useInfiniteQuery({
    enabled: enabled && Boolean(sessionId),
    getNextPageParam: (lastPage: ChatMessageListResponse) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? null) : null,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }): Promise<ChatMessageListResponse> =>
      listMessages(
        sessionId,
        {
          ...baseParams,
          ...(pageParam ? { cursor: pageParam } : {}),
        },
        { signal },
      ),
    queryKey: [
      ...getListMessagesQueryKey(sessionId, baseParams),
      "infinite",
    ] as const,
  });
}
