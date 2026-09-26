"use client";

import { useEffect, useRef, useState } from "react";

import { isApiError } from "@/lib/api/api-error";
import { openEventStream } from "@/lib/api/event-stream";

const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

/**
 * Listens to a server event stream while enabled, reconnecting with
 * backoff. Returns whether it is connected, so callers can fall back to
 * polling while it isn't. Auth and not-found errors stop retrying.
 */
export function useEventStream(
  path: string | null,
  onEvent: (event: string, data: unknown) => void,
): boolean {
  const [isConnected, setIsConnected] = useState(false);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!path) return;

    const controller = new AbortController();
    let retryDelay = MIN_RETRY_MS;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    async function connect() {
      try {
        const events = await openEventStream(path as string, { signal: controller.signal });

        for await (const event of events) {
          if (event.event === "ready") {
            setIsConnected(true);
            retryDelay = MIN_RETRY_MS;
            continue;
          }

          let data: unknown = null;

          try {
            data = JSON.parse(event.data);
          } catch {
            continue;
          }

          onEventRef.current(event.event, data);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (isApiError(error) && error.status < 500 && error.status !== 429) {
          setIsConnected(false);
          return;
        }
      }

      if (controller.signal.aborted) return;

      setIsConnected(false);
      retryTimer = setTimeout(() => void connect(), retryDelay);
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
    }

    void connect();

    return () => {
      controller.abort();
      clearTimeout(retryTimer);
      setIsConnected(false);
    };
  }, [path]);

  return isConnected;
}
