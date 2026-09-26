import type {
  AiAgentMessage,
  AiProvider,
  AiTokenListener,
  AiToolCompletionRequest,
  AiToolCompletionResponse,
} from "../../src/integrations/ai/dto/ai.dto.js";

type ToolCallStep = { name: string; args: Record<string, unknown> | string };

/** What the fake model does on one call: call tools, or answer in text. */
export type ScriptStep =
  | { tools: ToolCallStep[] }
  | { text: string }
  | ((request: AiToolCompletionRequest) => { tools: ToolCallStep[] } | { text: string });

let callSequence = 0;

/** Parsed result of the most recent call to a tool in this turn's messages. */
export function lastToolResult<T = Record<string, unknown>>(messages: AiAgentMessage[], name: string): T {
  const message = [...messages].reverse().find((item) => item.role === "tool" && item.name === name);

  if (!message || message.role !== "tool") throw new Error(`No ${name} result yet`);

  return JSON.parse(message.content) as T;
}

/** A stand-in model that plays back scripted steps and records every request. */
export class ScriptedProvider implements AiProvider {
  public readonly name = "mistral" as const;
  public readonly model = "scripted";
  public readonly requests: AiToolCompletionRequest[] = [];
  /** How many calls came through stream() rather than completeWithTools(). */
  public streamedCalls = 0;
  private steps: ScriptStep[] = [];

  public script(...steps: ScriptStep[]): void {
    this.steps = steps;
  }

  public completeWithTools(request: AiToolCompletionRequest): Promise<AiToolCompletionResponse> {
    this.requests.push(structuredClone(request));

    const step = this.steps.shift();

    if (!step) return Promise.reject(new Error("Scripted provider ran out of steps"));

    const resolved = typeof step === "function" ? step(request) : step;

    if ("text" in resolved) {
      return Promise.resolve({ content: resolved.text, toolCalls: [], provider: "mistral", model: this.model });
    }

    return Promise.resolve({
      content: "",
      toolCalls: resolved.tools.map((call) => {
        callSequence += 1;

        return {
          id: `call${String(callSequence).padStart(5, "0")}`.slice(0, 9),
          name: call.name,
          arguments: typeof call.args === "string" ? call.args : JSON.stringify(call.args),
        };
      }),
      provider: "mistral",
      model: this.model,
    });
  }

  /** Plays the same steps, handing text replies over word by word. */
  public async stream(request: AiToolCompletionRequest, onToken: AiTokenListener): Promise<AiToolCompletionResponse> {
    this.streamedCalls += 1;

    const response = await this.completeWithTools(request);

    for (const word of response.content.match(/\S+\s*/g) ?? []) onToken(word);

    return response;
  }
}
