import { afterEach, describe, expect, it, vi } from "vitest";

import { AiProviderError } from "../../src/integrations/ai/errors/ai-provider.error.js";
import { MistralProvider } from "../../src/integrations/ai/providers/mistral.provider.js";

const provider = new MistralProvider({ apiKey: "key", model: "mistral-small-latest", apiUrl: "https://mistral.test/v1", timeoutMs: 5_000 });

const request = {
  systemPrompt: "sys",
  messages: [{ role: "user" as const, content: "hi" }],
  tools: [],
  toolChoice: "auto" as const,
  maxOutputTokens: 100,
  temperature: 0,
};

function streamResponse(...chunks: unknown[]): Response {
  const encoder = new TextEncoder();
  const text = [...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`), "data: [DONE]\n\n"].join("");

  return new Response(
    new ReadableStream({
      start(controller) {
        // Split mid-event to prove chunk boundaries don't matter.
        controller.enqueue(encoder.encode(text.slice(0, 25)));
        controller.enqueue(encoder.encode(text.slice(25)));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

describe("Mistral streaming", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("passes text through as it arrives and returns the whole reply", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse(
        { model: "mistral-small-2501", choices: [{ index: 0, delta: { content: "Your haircut " } }] },
        { choices: [{ index: 0, delta: { content: "is held." }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } },
      ),
    );
    const tokens: string[] = [];

    vi.stubGlobal("fetch", fetchMock);

    const response = await provider.stream(request, (text) => tokens.push(text));

    expect(tokens).toEqual(["Your haircut ", "is held."]);
    expect(response).toMatchObject({
      content: "Your haircut is held.",
      toolCalls: [],
      model: "mistral-small-2501",
      usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
      finishReason: "stop",
    });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toMatchObject({ stream: true });
  });

  it("assembles tool calls sent in pieces", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse(
          { choices: [{ delta: { tool_calls: [{ index: 0, id: "abcDEF123", function: { name: "get_availability", arguments: '{"date":' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"2026-11-03"}' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 1, function: { name: "search_services", arguments: { query: "cut" } } }] }, finish_reason: "tool_calls" }] },
        ),
      ),
    );

    const response = await provider.stream(request, () => undefined);

    expect(response.toolCalls).toEqual([
      { id: "abcDEF123", name: "get_availability", arguments: '{"date":"2026-11-03"}' },
      { id: expect.stringMatching(/^[a-zA-Z0-9]{9}$/), name: "search_services", arguments: '{"query":"cut"}' },
    ]);
  });

  it("rejects malformed chunks and HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("data: {not json}\n\n", { status: 200 })));
    await expect(provider.stream(request, () => undefined)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("busy", { status: 503 })));
    await expect(provider.stream(request, () => undefined)).rejects.toBeInstanceOf(AiProviderError);
  });
});
