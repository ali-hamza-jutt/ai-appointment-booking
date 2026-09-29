import { env } from "../../../config/env.js";
import { logger } from "../../../config/logger.js";
import { prisma } from "../../../infrastructure/database/prisma.js";
import { getRedis, redisKey } from "../../../infrastructure/redis/redis.js";

export type GuardrailRefusal = "customer_rate" | "business_budget";

/**
 * Limits on the assistant before it runs: a customer can start only so many
 * turns a minute (on any channel), and a business only spend so many tokens
 * a day. A refused turn falls back to tap-to-book, so booking still works.
 */
export const aiGuardrails = {
  async check(businessId: string, userId: string, now: Date = new Date()): Promise<GuardrailRefusal | null> {
    if (await this.overDailyBudget(businessId, now)) return "business_budget";
    if (!(await this.takeCustomerTurn(userId, now))) return "customer_rate";

    return null;
  },

  /** Counts a turn for this customer in the current minute; false once they're over the cap. */
  async takeCustomerTurn(userId: string, now: Date): Promise<boolean> {
    const redis = getRedis();

    if (!redis) return true;

    const key = redisKey("ai-turns", userId, String(Math.floor(now.getTime() / 60_000)));

    try {
      const turns = await redis.incr(key);

      if (turns === 1) await redis.expire(key, 120);

      return turns <= env.AI_MAX_TURNS_PER_MINUTE;
    } catch (error) {
      // A Redis outage shouldn't take the assistant down with it.
      logger.warn({ err: error }, "Could not count an assistant turn");
      return true;
    }
  },

  /** True once the business's model calls today (UTC) have used the daily token budget. */
  async overDailyBudget(businessId: string, now: Date): Promise<boolean> {
    const budget = env.LLM_DAILY_TOKEN_BUDGET;

    if (budget <= 0) return false;

    const today = await prisma.llmUsage.aggregate({
      where: { businessId, date: new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`) },
      _sum: { inputTokens: true, outputTokens: true },
    });

    return Number(today._sum.inputTokens ?? 0n) + Number(today._sum.outputTokens ?? 0n) >= budget;
  },
};
