import { Redis } from "ioredis";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { JOB_CONSTANTS } from "../../constants/app.constants.js";

interface ConnectionOptions {
  maxRetriesPerRequest?: number | null;
  commandTimeout?: number;
}

let sharedClient: Redis | null = null;
const openConnections = new Set<Redis>();

export function isRedisConfigured(): boolean {
  return Boolean(env.REDIS_URL);
}

/** Namespaced key so several environments can share one Redis. */
export function redisKey(...parts: string[]): string {
  return [JOB_CONSTANTS.REDIS_KEY_PREFIX, ...parts].join(":");
}

/**
 * A new connection. BullMQ workers block on their connection, so each one
 * needs its own; `maxRetriesPerRequest: null` is required by BullMQ.
 */
export function createRedisConnection(options: ConnectionOptions = {}): Redis {
  if (!env.REDIS_URL) {
    throw new Error("REDIS_URL is not configured");
  }

  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    ...options,
  });

  connection.on("error", (error) => {
    logger.warn({ err: error }, "Redis connection error");
  });
  openConnections.add(connection);

  return connection;
}

/** The shared client for cache, idempotency and rate limits; null without Redis. */
export function getRedis(): Redis | null {
  if (!env.REDIS_URL) return null;

  // Request-path commands fail fast so a Redis outage degrades to no cache
  // instead of stalling API responses.
  sharedClient ??= createRedisConnection({
    maxRetriesPerRequest: JOB_CONSTANTS.REDIS_REQUEST_RETRIES,
    commandTimeout: JOB_CONSTANTS.REDIS_COMMAND_TIMEOUT_MS,
  });

  return sharedClient;
}

export async function closeRedis(): Promise<void> {
  const connections = [...openConnections];

  openConnections.clear();
  sharedClient = null;

  await Promise.allSettled(connections.map((connection) => connection.quit()));
}
