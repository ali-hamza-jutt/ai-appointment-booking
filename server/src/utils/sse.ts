export interface ServerSentEvent {
  event: string;
  data: string;
}

/** Parses a text/event-stream body into events; comments and ids are ignored. */
export async function* readServerSentEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ServerSentEvent> {
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

  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });

    let newline = buffer.search(/\r?\n/);

    while (newline >= 0) {
      const line = buffer.slice(0, newline);

      buffer = buffer.slice(buffer[newline] === "\r" ? newline + 2 : newline + 1);
      newline = buffer.search(/\r?\n/);

      const complete = readLine(line);

      if (complete) yield complete;
    }
  }

  // A stream may end without the final blank line.
  if (buffer) readLine(buffer);
  if (data.length > 0) yield { event, data: data.join("\n") };
}

/** Formats one event for a text/event-stream response. */
export function formatServerSentEvent(event: string, data: unknown): string {
  const payload = JSON.stringify(data)
    .split("\n")
    .map((line) => `data: ${line}`)
    .join("\n");

  return `event: ${event}\n${payload}\n\n`;
}
