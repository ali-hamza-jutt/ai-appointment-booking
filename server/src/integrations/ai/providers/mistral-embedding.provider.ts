import { z } from "zod";

import { KNOWLEDGE_CONSTANTS } from "../../../constants/app.constants.js";
import { llmMetrics } from "../../../infrastructure/observability/metrics.js";
import { withSpan } from "../../../infrastructure/observability/tracing.js";
import type { MistralProviderConfig } from "../dto/ai.dto.js";
import { AiProviderError } from "../errors/ai-provider.error.js";

/** Turns text into vectors for semantic search. */
export interface EmbeddingProvider {
  readonly model: string;
  embed(texts: string[], businessId?: string): Promise<number[][]>;
}

const embeddingResponseSchema = z.object({
  model: z.string().optional(),
  data: z.array(z.object({ index: z.number().int(), embedding: z.array(z.number()) })),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative() }).optional(),
});

export class MistralEmbeddingProvider implements EmbeddingProvider {
  public readonly model: string;
  private readonly apiUrl: string;

  public constructor(private readonly config: MistralProviderConfig) {
    this.model = config.model;
    this.apiUrl = config.apiUrl.replace(/\/$/, "");
  }

  public embed(texts: string[], businessId?: string): Promise<number[][]> {
    const startedAt = performance.now();

    return withSpan(
      `embeddings ${this.model}`,
      { "gen_ai.operation.name": "embeddings", "gen_ai.request.model": this.model, "embedding.inputs": texts.length },
      async () => {
        try {
          const vectors = await this.request(texts, businessId, startedAt);

          return vectors;
        } catch (error) {
          llmMetrics.completion({
            model: this.model,
            businessId,
            outcome: "error",
            durationSeconds: (performance.now() - startedAt) / 1_000,
          });
          throw error;
        }
      },
    );
  }

  private async request(texts: string[], businessId: string | undefined, startedAt: number): Promise<number[][]> {
    let response: Response;

    try {
      response = await fetch(`${this.apiUrl}${KNOWLEDGE_CONSTANTS.EMBEDDINGS_PATH}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, input: texts }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new AiProviderError("TIMEOUT", "Mistral embeddings request timed out");
      }

      throw new AiProviderError("NETWORK_ERROR", "Could not reach Mistral");
    }

    if (!response.ok) {
      throw new AiProviderError("HTTP_ERROR", "Mistral embeddings returned a non-success status", response.status);
    }

    const parsed = embeddingResponseSchema.safeParse(await response.json().catch(() => null));

    if (!parsed.success || parsed.data.data.length !== texts.length) {
      throw new AiProviderError("INVALID_RESPONSE", "Mistral embeddings response did not match the request");
    }

    llmMetrics.completion({
      model: parsed.data.model ?? this.model,
      businessId,
      outcome: "success",
      durationSeconds: (performance.now() - startedAt) / 1_000,
      inputTokens: parsed.data.usage?.prompt_tokens ?? 0,
      outputTokens: 0,
    });

    return [...parsed.data.data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }
}
