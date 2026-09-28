import { randomUUID } from "node:crypto";

import { logger } from "../../config/logger.js";
import { prisma } from "../database/prisma.js";
import { llmCostUsd } from "./metrics.js";

export interface LlmUsageInput {
  businessId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Adds one model call to its business's daily total, for the admin's spend
 * view. One upsert per call; a failure is logged and never fails the chat.
 */
export const llmUsageRecorder = {
  async record(input: LlmUsageInput, at: Date = new Date()): Promise<void> {
    const date = at.toISOString().slice(0, 10);
    const cost = llmCostUsd(input.model, input.inputTokens, input.outputTokens) ?? 0;

    await prisma.$executeRaw`
      INSERT INTO "llm_usage" ("id", "business_id", "date", "model", "requests", "input_tokens", "output_tokens", "cost_usd")
      VALUES (${randomUUID()}::uuid, ${input.businessId}::uuid, ${date}::date, ${input.model}, 1, ${input.inputTokens}, ${input.outputTokens}, ${cost})
      ON CONFLICT ("business_id", "date", "model") DO UPDATE SET
        "requests" = "llm_usage"."requests" + 1,
        "input_tokens" = "llm_usage"."input_tokens" + EXCLUDED."input_tokens",
        "output_tokens" = "llm_usage"."output_tokens" + EXCLUDED."output_tokens",
        "cost_usd" = "llm_usage"."cost_usd" + EXCLUDED."cost_usd"
    `;
  },

  recordInBackground(input: LlmUsageInput): void {
    void this.record(input).catch((error: unknown) => {
      logger.warn({ err: error, businessId: input.businessId }, "Recording LLM usage failed");
    });
  },
};
