import { randomBytes } from "node:crypto";

import { AI_CONSTANTS } from "../../../constants/app.constants.js";
import { readServerSentEvents } from "../../../utils/sse.js";
import type {
  AiAgentMessage,
  AiProvider,
  AiProviderName,
  AiTokenListener,
  AiTokenUsage,
  AiToolCompletionRequest,
  AiToolCompletionResponse,
  MistralAssistantContent,
  MistralProviderConfig,
} from "../dto/ai.dto.js";
import { mistralChatCompletionResponseSchema, mistralStreamChunkSchema } from "../dto/ai.dto.js";
import { AiProviderError } from "../errors/ai-provider.error.js";

/** Mistral expects 9-character alphanumeric tool call ids. */
function normalizeToolCallId(id: string | undefined): string {
  if (id && /^[a-zA-Z0-9]{9}$/.test(id)) return id;

  return randomBytes(12).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 9).padEnd(9, "0");
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export class MistralProvider implements AiProvider {
  public readonly name: AiProviderName = AI_CONSTANTS.PROVIDER;
  public readonly model: string;

  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly timeoutMs: number;

  public constructor(config: MistralProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.apiUrl = config.apiUrl.replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs;
  }

  public async completeWithTools(request: AiToolCompletionRequest): Promise<AiToolCompletionResponse> {
    const response = await this.send(this.toPayload(request, false));
    let body: unknown;

    try {
      body = await response.json();
    } catch {
      throw new AiProviderError("INVALID_RESPONSE", "Mistral returned invalid JSON");
    }

    const parsed = mistralChatCompletionResponseSchema.safeParse(body);

    if (!parsed.success) {
      throw new AiProviderError("INVALID_RESPONSE", "Mistral response did not match the expected structure");
    }

    const choice = parsed.data.choices[0];

    if (!choice) {
      throw new AiProviderError("INVALID_RESPONSE", "Mistral response did not contain a completion");
    }

    const toolCalls = (choice.message.tool_calls ?? []).map((call) => ({
      id: normalizeToolCallId(call.id),
      name: call.function.name,
      arguments:
        typeof call.function.arguments === "string"
          ? call.function.arguments
          : JSON.stringify(call.function.arguments),
    }));
    const content = this.toText(choice.message.content).trim();

    if (!content && toolCalls.length === 0) {
      throw new AiProviderError("INVALID_RESPONSE", "Mistral response content was empty");
    }

    const usage = parsed.data.usage;

    return {
      content,
      toolCalls,
      provider: this.name,
      model: parsed.data.model,
      ...(usage
        ? {
            usage: {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            },
          }
        : {}),
      ...(choice.finish_reason !== undefined ? { finishReason: choice.finish_reason } : {}),
    };
  }

  /** Streams the completion; tool calls arrive in pieces and are assembled by index. */
  public async stream(request: AiToolCompletionRequest, onToken: AiTokenListener): Promise<AiToolCompletionResponse> {
    const response = await this.send(this.toPayload(request, true));

    if (!response.body) throw new AiProviderError("INVALID_RESPONSE", "Mistral stream had no body");

    let content = "";
    let model = this.model;
    let usage: AiTokenUsage | undefined;
    let finishReason: string | null | undefined;
    const calls = new Map<number, { id?: string; name: string; arguments: string }>();

    try {
      for await (const event of readServerSentEvents(response.body)) {
        if (event.data === "[DONE]") break;

        const parsed = mistralStreamChunkSchema.safeParse(safeJson(event.data));

        if (!parsed.success) throw new AiProviderError("INVALID_RESPONSE", "Mistral stream chunk was malformed");

        model = parsed.data.model ?? model;
        if (parsed.data.usage) {
          usage = {
            promptTokens: parsed.data.usage.prompt_tokens,
            completionTokens: parsed.data.usage.completion_tokens,
            totalTokens: parsed.data.usage.total_tokens,
          };
        }

        for (const choice of parsed.data.choices) {
          const text = this.toText(choice.delta?.content);

          if (text) {
            content += text;
            onToken(text);
          }

          for (const [position, call] of (choice.delta?.tool_calls ?? []).entries()) {
            const index = call.index ?? position;
            const current = calls.get(index) ?? { name: "", arguments: "" };
            const argumentsPart = call.function?.arguments;

            calls.set(index, {
              ...(call.id ?? current.id ? { id: call.id ?? current.id } : {}),
              name: current.name + (call.function?.name ?? ""),
              arguments:
                current.arguments +
                (typeof argumentsPart === "string" ? argumentsPart : argumentsPart ? JSON.stringify(argumentsPart) : ""),
            });
          }

          if (choice.finish_reason !== undefined) finishReason = choice.finish_reason;
        }
      }
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new AiProviderError("TIMEOUT", "Mistral stream timed out");
      }

      throw new AiProviderError("NETWORK_ERROR", "Mistral stream was interrupted");
    }

    const toolCalls = [...calls.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, call]) => call.name)
      .map(([, call]) => ({ id: normalizeToolCallId(call.id), name: call.name, arguments: call.arguments }));

    if (!content.trim() && toolCalls.length === 0) {
      throw new AiProviderError("INVALID_RESPONSE", "Mistral response content was empty");
    }

    return {
      content: content.trim(),
      toolCalls,
      provider: this.name,
      model,
      ...(usage ? { usage } : {}),
      ...(finishReason !== undefined ? { finishReason } : {}),
    };
  }

  private toPayload(request: AiToolCompletionRequest, stream: boolean): Record<string, unknown> {
    return {
      model: this.model,
      messages: [{ role: "system", content: request.systemPrompt }, ...request.messages.map(toMistralMessage)],
      ...(request.tools.length > 0
        ? {
            tools: request.tools.map((tool) => ({
              type: "function",
              function: { name: tool.name, description: tool.description, parameters: tool.parameters },
            })),
            tool_choice: request.toolChoice,
          }
        : {}),
      temperature: request.temperature,
      max_tokens: request.maxOutputTokens,
      ...(stream ? { stream: true } : {}),
    };
  }

  private async send(payload: Record<string, unknown>): Promise<Response> {
    let response: Response;

    try {
      response = await fetch(`${this.apiUrl}${AI_CONSTANTS.CHAT_COMPLETIONS_PATH}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new AiProviderError("TIMEOUT", "Mistral request timed out");
      }

      throw new AiProviderError("NETWORK_ERROR", "Could not reach Mistral");
    }

    if (!response.ok) {
      throw new AiProviderError("HTTP_ERROR", "Mistral returned a non-success status", response.status);
    }

    return response;
  }

  private toText(content: MistralAssistantContent): string {
    if (!content) return "";
    if (typeof content === "string") return content;

    return content.map((chunk) => chunk.text ?? "").join("");
  }
}

function toMistralMessage(message: AiAgentMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.toolCallId, name: message.name, content: message.content };
  }

  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }

  return { role: message.role, content: message.content };
}
