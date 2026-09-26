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

/** Progress callbacks for streaming a turn to the client as it happens. */
export interface AgentRunListener<Part> {
  /** Reply text as the model writes it. Text from a round that ends in tool calls is superseded. */
  token?(text: string): void;
  /** A tool is about to run, with its validated arguments. */
  toolCall?(name: string, args: unknown): void;
  /** A tool produced cards or buttons. */
  parts?(parts: Part[]): void;
}

export interface AgentRunRequest<Context, Part> {
  systemPrompt: string;
  history: AiAgentMessage[];
  tools: AgentTool<Context, Part, never>[];
  context: Context;
  businessId?: string;
  listener?: AgentRunListener<Part>;
}

export interface AgentRunResult<Part> {
  text: string;
  parts: Part[];
  toolCalls: AgentToolCallLog[];
  rounds: number;
  usage: AiTokenUsage;
}
