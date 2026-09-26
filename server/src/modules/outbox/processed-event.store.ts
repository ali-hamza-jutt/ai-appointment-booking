import type { Redis } from "ioredis";

import { JOB_CONSTANTS } from "../../constants/app.constants.js";
import { redisKey } from "../../infrastructure/redis/redis.js";

const DONE = "done";
const IN_PROGRESS = "in-progress";

export type ClaimResult = "claimed" | "done" | "busy";

/**
 * Remembers which consumer finished which event. A consumer claims an
 * event before handling it, so two deliveries of the same event never run
 * side by side; a crashed claim lapses and the event is retried.
 */
export class ProcessedEventStore {
  public constructor(private readonly redis: Redis) {}

  public async claim(consumer: string, eventId: string): Promise<ClaimResult> {
    const key = this.key(consumer, eventId);
    const claimed = await this.redis.set(
      key,
      IN_PROGRESS,
      "EX",
      JOB_CONSTANTS.CONSUMER_CLAIM_TTL_SECONDS,
      "NX",
    );

    if (claimed === "OK") return "claimed";

    return (await this.redis.get(key)) === DONE ? "done" : "busy";
  }

  public async complete(consumer: string, eventId: string): Promise<void> {
    await this.redis.set(
      this.key(consumer, eventId),
      DONE,
      "EX",
      JOB_CONSTANTS.PROCESSED_EVENT_TTL_SECONDS,
    );
  }

  public async release(consumer: string, eventId: string): Promise<void> {
    await this.redis.del(this.key(consumer, eventId));
  }

  private key(consumer: string, eventId: string): string {
    return redisKey("processed", consumer, eventId);
  }
}
