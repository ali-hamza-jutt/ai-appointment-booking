import { createHash } from "node:crypto";

import { logger } from "../../config/logger.js";
import { JOB_CONSTANTS } from "../../constants/app.constants.js";
import { getRedis, redisKey } from "./redis.js";

type JsonReviver = (key: string, value: unknown) => unknown;

interface VersionedCacheOptions {
  namespace: string;
  ttlSeconds: number;
  reviver?: JsonReviver;
}

/**
 * A best-effort JSON cache partitioned by scope (for example a business).
 * Bumping a scope's version orphans all of its entries at once, which lets
 * writers invalidate without knowing every key. Any Redis failure falls
 * back to computing the value.
 */
export class VersionedCache<Value> {
  public constructor(private readonly options: VersionedCacheOptions) {}

  public async getOrCompute(
    scope: string,
    params: Record<string, unknown>,
    compute: () => Promise<Value>,
  ): Promise<Value> {
    const redis = getRedis();

    if (!redis || this.options.ttlSeconds === 0) return compute();

    let key: string | null = null;

    try {
      const version = (await redis.get(this.versionKey(scope))) ?? "0";

      key = redisKey(this.options.namespace, scope, version, hashParams(params));

      const cached = await redis.get(key);

      if (cached !== null) return JSON.parse(cached, this.options.reviver) as Value;
    } catch (error) {
      logger.warn({ err: error, namespace: this.options.namespace }, "Cache read failed");
    }

    const value = await compute();

    if (key) {
      redis
        .set(key, JSON.stringify(value), "EX", this.options.ttlSeconds)
        .catch((error: unknown) => {
          logger.warn({ err: error, namespace: this.options.namespace }, "Cache write failed");
        });
    }

    return value;
  }

  public async invalidate(scope: string): Promise<void> {
    const redis = getRedis();

    if (!redis) return;

    try {
      const versionKey = this.versionKey(scope);

      await redis
        .multi()
        .incr(versionKey)
        .expire(versionKey, JOB_CONSTANTS.CACHE_VERSION_TTL_SECONDS)
        .exec();
    } catch (error) {
      logger.warn({ err: error, namespace: this.options.namespace, scope }, "Cache invalidation failed");
    }
  }

  private versionKey(scope: string): string {
    return redisKey(this.options.namespace, scope, "version");
  }
}

function hashParams(params: Record<string, unknown>): string {
  const canonical = JSON.stringify(
    Object.keys(params)
      .sort()
      .map((key) => [key, params[key] ?? null]),
  );

  return createHash("sha256").update(canonical).digest("base64url").slice(0, 32);
}
