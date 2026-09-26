import { describe, expect, it } from "vitest";

import { formatServerSentEvent, readServerSentEvents } from "../../src/utils/sse.js";

function bodyOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>) {
  const events = [];

  for await (const event of readServerSentEvents(body)) events.push(event);

  return events;
}

describe("server-sent events", () => {
  it("parses events split across chunks, with CRLF, comments and multi-line data", async () => {
    const events = await collect(
      bodyOf("retry: 3000\n\n: keep-alive\n\nevent: tok", "en\ndata: {\"text\":\"Hi\"}\r\n\r\ndata: line one\n", "data: line two\n\n"),
    );

    expect(events).toEqual([
      { event: "token", data: '{"text":"Hi"}' },
      { event: "message", data: "line one\nline two" },
    ]);
  });

  it("yields a final event without a trailing blank line", async () => {
    expect(await collect(bodyOf("data: [DONE]"))).toEqual([{ event: "message", data: "[DONE]" }]);
  });

  it("formats events that round-trip through the parser", async () => {
    const text = formatServerSentEvent("part", { text: "two\nlines" });

    expect(text).toBe('event: part\ndata: {"text":"two\\nlines"}\n\n');
    expect(await collect(bodyOf(text))).toEqual([{ event: "part", data: '{"text":"two\\nlines"}' }]);
  });
});
