import { randomBytes } from "node:crypto";

import { AI_CONSTANTS } from "../../../constants/app.constants.js";
import type {
  AiAgentMessage,
  AiProvider,
  AiProviderName,
  AiToolCompletionRequest,
  AiToolCompletionResponse,
  MistralAssistantContent,
  MistralProviderConfig,
} from "../dto/ai.dto.js";
import { mistralChatCompletionResponseSchema } from "../dto/ai.dto.js";
import { AiProviderError } from "../errors/ai-provider.error.js";

/** Mistral expects 9-character alphanumeric tool call ids. */
function toolCallId(): string {
  return randomBytes(12).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 9).padEnd(9, "0");
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
    const body = await this.post({
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
    });
    const parsed = mistralChatCompletionResponseSchema.safeParse(body);

    if (!parsed.success) {
      throw new AiProviderError("INVALID_RESPONSE", "Mistral response did not match the expected structure");
    }

    const choice = parsed.data.choices[0];

    if (!choice) {
      throw new AiProviderError("INVALID_RESPONSE", "Mistral response did not contain a completion");
    }

    const toolCalls = (choice.message.tool_calls ?? []).map((call) => ({
      id: call.id && /^[a-zA-Z0-9]{9}$/.test(call.id) ? call.id : toolCallId(),
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

  private async post(payload: Record<string, unknown>): Promise<unknown> {
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

    try {
      return await response.json();
    } catch {
      throw new AiProviderError("INVALID_RESPONSE", "Mistral returned invalid JSON");
    }
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
