import { OBSERVABILITY_CONSTANTS } from "../../../constants/app.constants.js";
import { llmUsageRecorder } from "../../../infrastructure/observability/llm-usage.js";
import { llmMetrics } from "../../../infrastructure/observability/metrics.js";
import { withSpan } from "../../../infrastructure/observability/tracing.js";
import type {
  AiProvider,
  AiProviderName,
  AiTokenListener,
  AiToolCompletionRequest,
  AiToolCompletionResponse,
} from "../dto/ai.dto.js";

/**
 * Wraps a provider with a span and latency, token and cost metrics
 * attributed to the business. Prompts and replies are never recorded.
 */
export class InstrumentedAiProvider implements AiProvider {
  public constructor(private readonly provider: AiProvider) {}

  public get name(): AiProviderName {
    return this.provider.name;
  }

  public get model(): string {
    return this.provider.model;
  }

  public completeWithTools(request: AiToolCompletionRequest): Promise<AiToolCompletionResponse> {
    return this.instrument(request, false, () => this.provider.completeWithTools(request));
  }

  public get stream():
    | ((request: AiToolCompletionRequest, onToken: AiTokenListener) => Promise<AiToolCompletionResponse>)
    | undefined {
    const inner = this.provider.stream?.bind(this.provider);

    if (!inner) return undefined;

    return (request, onToken) => this.instrument(request, true, () => inner(request, onToken));
  }

  private instrument(
    request: AiToolCompletionRequest,
    streamed: boolean,
    call: () => Promise<AiToolCompletionResponse>,
  ): Promise<AiToolCompletionResponse> {
    const startedAt = performance.now();
    const seconds = () => (performance.now() - startedAt) / 1_000;

    return withSpan(
      `chat ${this.provider.model}`,
      {
        "gen_ai.operation.name": "chat",
        "gen_ai.system": this.provider.name,
        "gen_ai.request.model": this.provider.model,
        "gen_ai.request.max_tokens": request.maxOutputTokens,
        "gen_ai.request.stream": streamed,
        ...(request.businessId ? { [OBSERVABILITY_CONSTANTS.BUSINESS_ID_ATTRIBUTE]: request.businessId } : {}),
      },
      async (span) => {
        try {
          const response = await call();

          span.setAttributes({
            "gen_ai.response.model": response.model,
            "gen_ai.response.tool_calls": response.toolCalls.map((call) => call.name).join(","),
            ...(response.usage
              ? {
                  "gen_ai.usage.input_tokens": response.usage.promptTokens,
                  "gen_ai.usage.output_tokens": response.usage.completionTokens,
                }
              : {}),
          });
          llmMetrics.completion({
            model: response.model,
            businessId: request.businessId,
            outcome: "success",
            durationSeconds: seconds(),
            ...(response.usage
              ? { inputTokens: response.usage.promptTokens, outputTokens: response.usage.completionTokens }
              : {}),
          });
          if (request.businessId && response.usage) {
            llmUsageRecorder.recordInBackground({
              businessId: request.businessId,
              model: response.model,
              inputTokens: response.usage.promptTokens,
              outputTokens: response.usage.completionTokens,
            });
          }

          return response;
        } catch (error) {
          llmMetrics.completion({
            model: this.provider.model,
            businessId: request.businessId,
            outcome: "error",
            durationSeconds: seconds(),
          });
          throw error;
        }
      },
    );
  }
}
