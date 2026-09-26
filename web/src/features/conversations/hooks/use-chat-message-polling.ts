"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { CONVERSATION_UI_CONSTANTS } from "@/features/conversations/constants/conversation-ui.constants";
import { useChatSessionEvents } from "@/features/conversations/hooks/use-chat-session-events";
import type {
  ChatMessagePollingOptions,
  ChatMessagePollingState,
} from "@/features/conversations/types/conversation-ui";
import { listMessages } from "@/generated/api/chat/chat";
import type { ChatMessageResponse } from "@/generated/api/models";

/**
 * New messages for a chat. Refetches when the live event stream reports a
 * change, and falls back to polling whenever the stream isn't connected.
 */
export function useChatMessagePolling(
  sessionId: string,
  { enabled = true, initialCursor }: ChatMessagePollingOptions = {},
) {
  const queryClient = useQueryClient();
  const queryKey = ["chat-message-polling", sessionId] as const;
  const isEnabled = enabled && Boolean(sessionId);
  const refetchOnChange = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["chat-message-polling", sessionId] });
  }, [queryClient, sessionId]);
  const isLive = useChatSessionEvents(sessionId, isEnabled, refetchOnChange);

  return useQuery({
    enabled: isEnabled,
    queryFn: async ({ signal }): Promise<ChatMessagePollingState> => {
      const previous =
        queryClient.getQueryData<ChatMessagePollingState>(queryKey);
      const cursor = previous?.cursor ?? initialCursor;
      const response = await listMessages(
        sessionId,
        {
          limit: CONVERSATION_UI_CONSTANTS.MESSAGE_POLL_PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        },
        { signal },
      );
      const nextCursor = response.nextCursor ?? cursor;

      return {
        ...(nextCursor ? { cursor: nextCursor } : {}),
        items: mergeMessages(previous?.items ?? [], response.items),
      };
    },
    queryKey,
    refetchInterval: isLive ? false : CONVERSATION_UI_CONSTANTS.MESSAGE_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    retry: false,
    staleTime: 0,
  });
}

function mergeMessages(
  current: ChatMessageResponse[],
  incoming: ChatMessageResponse[],
): ChatMessageResponse[] {
  if (incoming.length === 0) return current;

  const messagesById = new Map(
    current.map((message) => [message.id, message]),
  );

  for (const message of incoming) {
    messagesById.set(message.id, message);
  }

  return Array.from(messagesById.values());
}
