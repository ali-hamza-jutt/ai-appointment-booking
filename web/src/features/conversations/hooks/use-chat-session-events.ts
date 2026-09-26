"use client";

import { useCallback } from "react";

import { useEventStream } from "@/hooks/use-event-stream";

/** Change notices for one chat (new messages from another tab, completion). */
export function useChatSessionEvents(sessionId: string, enabled: boolean, onChange: () => void): boolean {
  const handleEvent = useCallback(
    (event: string) => {
      if (event === "change") onChange();
    },
    [onChange],
  );

  return useEventStream(
    enabled && sessionId ? `/chat/sessions/${encodeURIComponent(sessionId)}/events` : null,
    handleEvent,
  );
}
