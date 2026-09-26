"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { getListHandoffsQueryKey } from "@/generated/api/chat-handoffs/chat-handoffs";
import { useEventStream } from "@/hooks/use-event-stream";

/**
 * Keeps the handoff list current from the business's live chat channel:
 * new handoffs, resolutions, and new messages in chats already handed off.
 */
export function useBusinessChatEvents(businessId: string): boolean {
  const queryClient = useQueryClient();
  const handleEvent = useCallback(
    (event: string) => {
      if (event !== "change") return;

      void queryClient.invalidateQueries({ queryKey: getListHandoffsQueryKey(businessId) });
    },
    [businessId, queryClient],
  );

  return useEventStream(`/businesses/${encodeURIComponent(businessId)}/chat-events`, handleEvent);
}
