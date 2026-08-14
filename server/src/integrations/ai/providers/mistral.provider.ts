import { AI_CONSTANTS } from "../../../constants/app.constants.js";
import type {
  AiProvider,
  AiProviderCompletionRequest,
  AiProviderCompletionResponse,
  AiProviderName,
  MistralAssistantContent,
  MistralProviderConfig,
} from "../dto/ai.dto.js";
import { mistralChatCompletionResponseSchema } from "../dto/ai.dto.js";
import { AiProviderError } from "../errors/ai-provider.error.js";

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

  public async completeJson(
    request: AiProviderCompletionRequest,
  ): Promise<AiProviderCompletionResponse> {
    let response: Response;

    try {
      response = await fetch(
        `${this.apiUrl}${AI_CONSTANTS.CHAT_COMPLETIONS_PATH}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: "system", content: request.systemPrompt },
              ...request.messages,
            ],
            response_format: { type: "json_object" },
            temperature: request.temperature,
            max_tokens: request.maxOutputTokens,
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new AiProviderError(
          "TIMEOUT",
          "Mistral request timed out",
        );
      }

      throw new AiProviderError(
        "NETWORK_ERROR",
        "Could not reach Mistral",
      );
    }

    if (!response.ok) {
      throw new AiProviderError(
        "HTTP_ERROR",
        "Mistral returned a non-success status",
        response.status,
      );
    }

    let responseBody: unknown;

    try {
      responseBody = await response.json();
    } catch (_error) {
      throw new AiProviderError(
        "INVALID_RESPONSE",
        "Mistral returned invalid JSON",
      );
    }

    const parsedResponse =
      mistralChatCompletionResponseSchema.safeParse(responseBody);

    if (!parsedResponse.success) {
      throw new AiProviderError(
        "INVALID_RESPONSE",
        "Mistral response did not match the expected structure",
      );
    }

    const firstChoice = parsedResponse.data.choices[0];

    if (!firstChoice) {
      throw new AiProviderError(
        "INVALID_RESPONSE",
        "Mistral response did not contain a completion",
      );
    }

    const content = this.toText(firstChoice.message.content).trim();

    if (!content) {
      throw new AiProviderError(
        "INVALID_RESPONSE",
        "Mistral response content was empty",
      );
    }

    const usage = parsedResponse.data.usage;

    return {
      content,
      provider: this.name,
      model: parsedResponse.data.model,
      ...(usage
        ? {
            usage: {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            },
          }
        : {}),
      ...(firstChoice.finish_reason !== undefined
        ? { finishReason: firstChoice.finish_reason }
        : {}),
    };
  }

  private toText(content: MistralAssistantContent): string {
    if (typeof content === "string") {
      return content;
    }

    return content.map((chunk) => chunk.text ?? "").join("");
  }
}
