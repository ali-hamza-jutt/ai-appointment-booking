import { readResponseBody, sendAuthenticated, toApiError } from "./api-fetch";

export const EVENT_STREAM_TYPE = "text/event-stream";

export interface ServerSentEvent {
  event: string;
  data: string;
}

/** The server can't stream here (an older API, or a proxy in the way); use the JSON endpoint. */
export class StreamUnavailableError extends Error {
  public constructor(message = "Streaming is not available") {
    super(message);
    this.name = "StreamUnavailableError";
  }
}

/** Parses a text/event-stream body into events; comments and ids are ignored. */
export async function* readServerSentEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ServerSentEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "message";
  let data: string[] = [];

  const readLine = (line: string): ServerSentEvent | null => {
    if (line === "") {
      const complete = data.length > 0 ? { event, data: data.join("\n") } : null;

      event = "message";
      data = [];
      return complete;
    }

    if (line.startsWith(":")) return null;

    const colon = line.indexOf(":");
    const field = colon >= 0 ? line.slice(0, colon) : line;
    const value = colon >= 0 ? line.slice(colon + 1).replace(/^ /, "") : "";

    if (field === "event") event = value;
    if (field === "data") data.push(value);
    return null;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.search(/\r?\n/);

      while (newline >= 0) {
        const line = buffer.slice(0, newline);

        buffer = buffer.slice(buffer[newline] === "\r" ? newline + 2 : newline + 1);
        newline = buffer.search(/\r?\n/);

        const complete = readLine(line);

        if (complete) yield complete;
      }
    }

    if (buffer) readLine(buffer);
    if (data.length > 0) yield { event, data: data.join("\n") };
  } finally {
    reader.releaseLock();
  }
}

/**
 * Opens an authenticated event stream. Error statuses throw the usual
 * ApiError; a response that isn't a stream throws StreamUnavailableError.
 */
export async function openEventStream(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal } = {},
): Promise<AsyncGenerator<ServerSentEvent>> {
  const response = await sendAuthenticated(
    path,
    {
      method: init.method ?? "GET",
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      ...(init.signal ? { signal: init.signal } : {}),
    },
    EVENT_STREAM_TYPE,
  );

  if (!response.ok) throw toApiError(response, await readResponseBody(response));

  if (!response.body || !response.headers.get("content-type")?.includes(EVENT_STREAM_TYPE)) {
    throw new StreamUnavailableError();
  }

  return readServerSentEvents(response.body);
}
