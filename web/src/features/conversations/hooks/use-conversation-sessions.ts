"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { CONVERSATION_UI_CONSTANTS } from "@/features/conversations/constants/conversation-ui.constants";
import type { ConversationFilter } from "@/features/conversations/types/conversation-ui";
import {
  getListSessionsQueryKey,
  listSessions,
} from "@/generated/api/chat/chat";
import type {
  ChatSessionListResponse,
  ListSessionsParams,
} from "@/generated/api/models";

export function useConversationSessions(filter: ConversationFilter) {
  const baseParams: ListSessionsParams = {
    limit: CONVERSATION_UI_CONSTANTS.SESSION_PAGE_SIZE,
    ...(filter !== "ALL" ? { status: filter } : {}),
  };

  return useInfiniteQuery({
    getNextPageParam: (lastPage: ChatSessionListResponse) =>
      lastPage.nextCursor ?? null,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }): Promise<ChatSessionListResponse> =>
      listSessions(
        {
          ...baseParams,
          ...(pageParam ? { cursor: pageParam } : {}),
        },
        { signal },
      ),
    queryKey: [...getListSessionsQueryKey(baseParams), "infinite"] as const,
  });
}
