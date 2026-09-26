import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AgentRunner, toToolDefinition } from "../../src/integrations/ai/agent/agent-runner.js";
import type { AgentTool } from "../../src/integrations/ai/agent/agent.dto.js";
import { AiProviderError } from "../../src/integrations/ai/errors/ai-provider.error.js";
import { AppError } from "../../src/middleware/app-error.js";
import { ScriptedProvider } from "../helpers/scripted-provider.js";

type Tool = AgentTool<{ calls: string[] }, string, never>;

const echo = {
  name: "echo",
  description: "Echo a word",
  schema: z.object({ word: z.string().min(2) }),
  handler: (args: { word: string }, context: { calls: string[] }) => {
    context.calls.push(args.word);

    return Promise.resolve({ data: { said: args.word }, parts: [`part:${args.word}`] });
  },
} as unknown as Tool;

const refusing = {
  name: "refuse",
  description: "Always refuses",
  schema: z.object({}),
  handler: () => Promise.reject(new AppError(409, "NOPE", "Not allowed")),
} as unknown as Tool;

function run(provider: ScriptedProvider, context = { calls: [] as string[] }) {
  return new AgentRunner(provider).run({ systemPrompt: "sys", history: [{ role: "user", content: "hi" }], tools: [echo, refusing], context });
}

describe("agent runner", () => {
  it("describes tools with JSON Schema", () => {
    expect(toToolDefinition(echo).parameters).toMatchObject({
      type: "object",
      properties: { word: { type: "string", minLength: 2 } },
      required: ["word"],
    });
  });

  it("runs tools, collects parts and returns the final text", async () => {
    const provider = new ScriptedProvider();
    const context = { calls: [] as string[] };

    provider.script({ tools: [{ name: "echo", args: { word: "one" } }, { name: "echo", args: { word: "two" } }] }, { text: "done" });

    const result = await run(provider, context);

    expect(result).toMatchObject({ text: "done", parts: ["part:one", "part:two"], rounds: 2 });
    expect(context.calls).toEqual(["one", "two"]);
    expect(provider.requests[1]?.messages.filter((message) => message.role === "tool")).toHaveLength(2);
  });

  it("returns validation and business errors to the model as tool results", async () => {
    const provider = new ScriptedProvider();

    provider.script({ tools: [{ name: "echo", args: { word: "x" } }, { name: "refuse", args: {} }] }, { text: "ok" });

    const result = await run(provider);
    const [invalid, refused] = (provider.requests[1]?.messages ?? []).flatMap((message) =>
      message.role === "tool" ? [JSON.parse(message.content) as Record<string, unknown>] : [],
    );

    expect(invalid).toMatchObject({ error: "Invalid arguments", issues: [{ path: "word" }] });
    expect(refused).toEqual({ error: "Not allowed", code: "NOPE" });
    expect(result.toolCalls).toEqual([
      { name: "echo", ok: false, error: "invalid_arguments" },
      { name: "refuse", ok: false, error: "NOPE" },
    ]);
  });

  it("retries a transient provider failure once, then gives up with a 503", async () => {
    const provider = new ScriptedProvider();
    const failure = () => {
      throw new AiProviderError("NETWORK_ERROR", "down");
    };

    provider.script(failure, { text: "recovered" });
    await expect(run(provider)).resolves.toMatchObject({ text: "recovered" });

    provider.script(failure, failure);
    await expect(run(provider)).rejects.toMatchObject({ statusCode: 503 });
  });
});
