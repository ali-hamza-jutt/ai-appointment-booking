import type { Response } from "express";

import { REALTIME_CONSTANTS } from "../../constants/app.constants.js";
import { formatServerSentEvent } from "../../utils/sse.js";

const openStreams = new Set<EventStream>();

/**
 * A text/event-stream response. Writes after the client has gone are
 * dropped, and a heartbeat comment keeps proxies from timing out.
 */
export class EventStream {
  private closed = false;
  private readonly heartbeat: NodeJS.Timeout;
  private readonly closeHandlers: Array<() => void> = [];

  public constructor(private readonly response: Response) {
    response.status(200);
    response.setHeader("Content-Type", `${REALTIME_CONSTANTS.EVENT_STREAM_TYPE}; charset=utf-8`);
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    // Stops nginx-style proxies from buffering the stream.
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();
    response.write(`retry: ${REALTIME_CONSTANTS.RECONNECT_DELAY_MS}\n\n`);

    this.heartbeat = setInterval(() => this.write(": keep-alive\n\n"), REALTIME_CONSTANTS.HEARTBEAT_INTERVAL_MS);
    this.heartbeat.unref();
    response.on("close", () => this.markClosed());
    openStreams.add(this);
  }

  public get isClosed(): boolean {
    return this.closed;
  }

  public send(event: string, data: unknown): void {
    this.write(formatServerSentEvent(event, data));
  }

  /** Runs when the client disconnects or the stream is ended. */
  public onClose(handler: () => void): void {
    if (this.closed) handler();
    else this.closeHandlers.push(handler);
  }

  public end(): void {
    if (this.closed) return;

    this.response.end();
    this.markClosed();
  }

  private write(chunk: string): void {
    if (!this.closed) this.response.write(chunk);
  }

  private markClosed(): void {
    if (this.closed) return;

    this.closed = true;
    clearInterval(this.heartbeat);
    openStreams.delete(this);
    for (const handler of this.closeHandlers.splice(0)) handler();
  }
}

/** Ends every open stream so the HTTP server can close during shutdown. */
export function closeAllEventStreams(): void {
  for (const stream of [...openStreams]) stream.end();
}
