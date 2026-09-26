import { z } from "zod";

import type { AI_CONSTANTS } from "../../../constants/app.constants.js";

export type AiProviderName = typeof AI_CONSTANTS.PROVIDER;

export type AiProviderErrorCode = (typeof AI_CONSTANTS.PROVIDER_ERROR_CODES)[number];

/** A function the model may call; parameters are a JSON Schema object. */
export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AiToolCall {
  id: string;
  name: string;
  /** Raw JSON text as the model produced it; validated before use. */
  arguments: string;
}

export type AiAgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: AiToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface AiToolCompletionRequest {
  systemPrompt: string;
  messages: AiAgentMessage[];
  tools: AiToolDefinition[];
  /** "none" forces a text answer, for example after the last tool round. */
  toolChoice: "auto" | "none";
  maxOutputTokens: number;
  temperature: number;
  /** Attributes usage to a business; never sent to the provider. */
  businessId?: string;
}

export interface AiTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AiToolCompletionResponse {
  content: string;
  toolCalls: AiToolCall[];
  provider: AiProviderName;
  model: string;
  usage?: AiTokenUsage;
  finishReason?: string | null;
}

/** Receives reply text as the model writes it. */
export type AiTokenListener = (text: string) => void;

export interface AiProvider {
  readonly name: AiProviderName;
  readonly model: string;

  completeWithTools(request: AiToolCompletionRequest): Promise<AiToolCompletionResponse>;

  /**
   * Same as completeWithTools, but passes reply text to onToken as it
   * arrives. Providers without streaming leave this out.
   */
  readonly stream?:
    | ((request: AiToolCompletionRequest, onToken: AiTokenListener) => Promise<AiToolCompletionResponse>)
    | undefined;
}

export interface MistralProviderConfig {
  apiKey: string;
  model: string;
  apiUrl: string;
  timeoutMs: number;
}

const mistralContentSchema = z
  .union([
    z.string(),
    z.array(z.object({ text: z.string().optional() }).passthrough()),
  ])
  .nullable()
  .optional();

export const mistralChatCompletionResponseSchema = z.object({
  model: z.string().min(1),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: mistralContentSchema,
          tool_calls: z
            .array(
              z.object({
                id: z.string().optional(),
                function: z.object({
                  name: z.string().min(1),
                  arguments: z.union([z.string(), z.record(z.string(), z.unknown())]),
                }),
              }),
            )
            .nullable()
            .optional(),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
      total_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});

/** One server-sent chunk of a streamed Mistral completion. */
export const mistralStreamChunkSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        index: z.number().int().optional(),
        delta: z
          .object({
            content: mistralContentSchema,
            tool_calls: z
              .array(
                z.object({
                  index: z.number().int().optional(),
                  id: z.string().optional(),
                  function: z
                    .object({
                      name: z.string().optional(),
                      arguments: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
                    })
                    .optional(),
                }),
              )
              .nullable()
              .optional(),
          })
          .optional(),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .default([]),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
      total_tokens: z.number().int().nonnegative(),
    })
    .nullable()
    .optional(),
});

export type MistralAssistantContent = z.infer<typeof mistralContentSchema>;
