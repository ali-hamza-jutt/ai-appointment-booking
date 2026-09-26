import { z } from "zod";

import { logger } from "../../../config/logger.js";
import {
  AGENT_CONSTANTS,
  AI_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
} from "../../../constants/app.constants.js";
import { AppError } from "../../../middleware/app-error.js";
import type {
  AiAgentMessage,
  AiProvider,
  AiToolCall,
  AiToolCompletionResponse,
  AiToolDefinition,
} from "../dto/ai.dto.js";
import { AiProviderError } from "../errors/ai-provider.error.js";
import type {
  AgentRunListener,
  AgentRunRequest,
  AgentRunResult,
  AgentTool,
  AgentToolCallLog,
} from "./agent.dto.js";

type AnyTool<Context, Part> = AgentTool<Context, Part, never>;

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/** Turns a Zod schema into the JSON Schema object the provider expects. */
export function toToolDefinition<Context, Part>(tool: AnyTool<Context, Part>): AiToolDefinition {
  const parameters = z.toJSONSchema(tool.schema as z.ZodType, { io: "input" }) as Record<string, unknown>;

  delete parameters.$schema;

  return { name: tool.name, description: tool.description, parameters };
}

/**
 * Runs one assistant turn: the model may call tools for up to
 * MAX_TOOL_ROUNDS rounds, then must answer in text. Bad arguments and
 * tool failures go back to the model as tool results so it can recover;
 * only provider failures end the turn.
 */
export class AgentRunner {
  public constructor(
    private readonly provider: AiProvider,
    private readonly maxRounds: number = AGENT_CONSTANTS.MAX_TOOL_ROUNDS,
  ) {}

  public async run<Context, Part>(request: AgentRunRequest<Context, Part>): Promise<AgentRunResult<Part>> {
    const tools = new Map(request.tools.map((tool) => [tool.name, tool]));
    const definitions = request.tools.map((tool) => toToolDefinition(tool));
    const messages: AiAgentMessage[] = [...request.history];
    const parts: Part[] = [];
    const toolCalls: AgentToolCallLog[] = [];
    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    for (let round = 1; round <= this.maxRounds + 1; round += 1) {
      const isFinalRound = round > this.maxRounds;
      const response = await this.complete({
        systemPrompt: request.systemPrompt,
        messages,
        tools: definitions,
        toolChoice: isFinalRound ? "none" : "auto",
        maxOutputTokens: AGENT_CONSTANTS.MAX_OUTPUT_TOKENS,
        temperature: AI_CONSTANTS.TEMPERATURE,
        ...(request.businessId ? { businessId: request.businessId } : {}),
      }, request.listener?.token);

      usage.promptTokens += response.usage?.promptTokens ?? 0;
      usage.completionTokens += response.usage?.completionTokens ?? 0;
      usage.totalTokens += response.usage?.totalTokens ?? 0;

      if (response.toolCalls.length === 0 || isFinalRound) {
        return { text: response.content, parts, toolCalls, rounds: round, usage };
      }

      messages.push({ role: "assistant", content: response.content, toolCalls: response.toolCalls });

      for (const call of response.toolCalls) {
        const outcome = await this.callTool(tools.get(call.name), call, request.context, request.listener);

        toolCalls.push(outcome.log);
        if (outcome.parts) {
          parts.push(...outcome.parts);
          request.listener?.parts?.(outcome.parts);
        }
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: truncate(JSON.stringify(outcome.data), AGENT_CONSTANTS.MAX_TOOL_RESULT_CHARS),
        });
      }
    }

    // Unreachable: the final round always returns.
    throw new AppError(503, ERROR_CODES.AI_PROVIDER_UNAVAILABLE, ERROR_MESSAGES.AI_PROVIDER_UNAVAILABLE);
  }

  private async callTool<Context, Part>(
    tool: AnyTool<Context, Part> | undefined,
    call: AiToolCall,
    context: Context,
    listener: AgentRunListener<Part> | undefined,
  ): Promise<{ data: unknown; parts?: Part[]; log: AgentToolCallLog }> {
    if (!tool) {
      return { data: { error: `Unknown tool ${call.name}` }, log: { name: call.name, ok: false, error: "unknown_tool" } };
    }

    let rawArguments: unknown;

    try {
      rawArguments = call.arguments.trim() ? JSON.parse(call.arguments) : {};
    } catch {
      return {
        data: { error: "Arguments were not valid JSON. Call the tool again with a JSON object." },
        log: { name: call.name, ok: false, error: "invalid_json" },
      };
    }

    const parsed = (tool.schema as z.ZodType).safeParse(rawArguments);

    if (!parsed.success) {
      return {
        data: {
          error: "Invalid arguments",
          issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        },
        log: { name: call.name, ok: false, error: "invalid_arguments" },
      };
    }

    listener?.toolCall?.(call.name, parsed.data);

    try {
      const result = await tool.handler(parsed.data as never, context);

      return { data: result.data, ...(result.parts ? { parts: result.parts } : {}), log: { name: call.name, ok: true } };
    } catch (error) {
      if (error instanceof AppError && error.statusCode < 500) {
        return {
          data: { error: error.message, code: error.code },
          log: { name: call.name, ok: false, error: error.code },
        };
      }

      logger.error({ err: error, tool: call.name }, "Agent tool failed");

      return {
        data: { error: "The tool failed. Tell the customer something went wrong and suggest the booking form." },
        log: { name: call.name, ok: false, error: "tool_failed" },
      };
    }
  }

  /**
   * One provider call, streamed when someone is listening for tokens.
   * Retried once on transient failures, unless tokens were already sent.
   */
  private async complete(
    request: Parameters<AiProvider["completeWithTools"]>[0],
    onToken: ((text: string) => void) | undefined,
  ): Promise<AiToolCompletionResponse> {
    for (let attempt = 1; ; attempt += 1) {
      let streamedText = false;

      try {
        if (onToken && this.provider.stream) {
          return await this.provider.stream(request, (text) => {
            streamedText = true;
            onToken(text);
          });
        }

        return await this.provider.completeWithTools(request);
      } catch (error) {
        if (!streamedText && attempt < AI_CONSTANTS.MAX_COMPLETION_ATTEMPTS && this.isRetryable(error)) {
          logger.warn({ attempt, code: (error as AiProviderError).code }, "Retrying AI completion");
          continue;
        }

        throw this.toAppError(error);
      }
    }
  }

  private isRetryable(error: unknown): boolean {
    if (!(error instanceof AiProviderError)) return false;
    if (error.code === "HTTP_ERROR") return error.statusCode === 408 || (error.statusCode ?? 0) >= 500;

    return true;
  }

  private toAppError(error: unknown): AppError {
    if (error instanceof AppError) return error;
    if (error instanceof AiProviderError && error.code === "TIMEOUT") {
      return new AppError(504, ERROR_CODES.AI_REQUEST_TIMEOUT, ERROR_MESSAGES.AI_REQUEST_TIMEOUT);
    }
    if (error instanceof AiProviderError && error.code === "INVALID_RESPONSE") {
      return new AppError(502, ERROR_CODES.AI_INVALID_RESPONSE, ERROR_MESSAGES.AI_INVALID_RESPONSE);
    }

    logger.error({ err: error }, "AI completion failed");

    return new AppError(503, ERROR_CODES.AI_PROVIDER_UNAVAILABLE, ERROR_MESSAGES.AI_PROVIDER_UNAVAILABLE);
  }
}
