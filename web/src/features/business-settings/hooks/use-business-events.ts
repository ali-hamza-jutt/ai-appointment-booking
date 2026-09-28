"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { getListBookingsQueryKey } from "@/generated/api/bookings/bookings";
import {
  getGetHandoffThreadQueryKey,
  getListHandoffsQueryKey,
} from "@/generated/api/chat-handoffs/chat-handoffs";
import { useEventStream } from "@/hooks/use-event-stream";

interface BusinessChange {
  type?: string;
  sessionId?: string;
}

/**
 * Keeps the dashboard current from the business's live channel: booking
 * changes refresh the calendar and bookings list, chat changes the inbox.
 * Returns whether the channel is connected, so pages can poll while it isn't.
 */
export function useBusinessEvents(businessId: string): boolean {
  const queryClient = useQueryClient();
  const handleEvent = useCallback(
    (event: string, data: unknown) => {
      if (event !== "change") return;

      const change = (data ?? {}) as BusinessChange;

      if (change.type === "booking") {
        void queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey(businessId) });
        return;
      }

      void queryClient.invalidateQueries({ queryKey: getListHandoffsQueryKey(businessId) });
      if (change.sessionId) {
        void queryClient.invalidateQueries({ queryKey: getGetHandoffThreadQueryKey(businessId, change.sessionId) });
      }
    },
    [businessId, queryClient],
  );

  return useEventStream(`/businesses/${encodeURIComponent(businessId)}/events`, handleEvent);
}
