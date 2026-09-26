import type { z } from "zod";

import type { AiAgentMessage, AiTokenUsage } from "../dto/ai.dto.js";

/** What a tool hands back: data for the model, plus optional UI parts for the reply. */
export interface AgentToolResult<Part> {
  data: unknown;
  parts?: Part[];
}

/**
 * A function the model may call. Arguments are validated with the Zod
 * schema before the handler runs; the handler receives the server-side
 * context (business, customer), never ids the model made up.
 */
export interface AgentTool<Context, Part, Args = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<Args>;
  handler(args: Args, context: Context): Promise<AgentToolResult<Part>>;
}

export interface AgentToolCallLog {
  name: string;
  ok: boolean;
  error?: string;
}

export interface AgentRunRequest<Context, Part> {
  systemPrompt: string;
  history: AiAgentMessage[];
  tools: AgentTool<Context, Part, never>[];
  context: Context;
  businessId?: string;
}

export interface AgentRunResult<Part> {
  text: string;
  parts: Part[];
  toolCalls: AgentToolCallLog[];
  rounds: number;
  usage: AiTokenUsage;
}
