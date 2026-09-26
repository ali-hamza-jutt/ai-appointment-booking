import type { Redis } from "ioredis";

import { getRedis } from "../../src/infrastructure/redis/redis.js";

export function getTestRedis(): Redis {
  const redis = getRedis();

  if (!redis) throw new Error("Tests need REDIS_URL (or TEST_REDIS_URL)");

  return redis;
}

/** Empties the test Redis database. */
export async function resetRedis(): Promise<void> {
  await getTestRedis().flushdb();
}
