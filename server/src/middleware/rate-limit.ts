import { rateLimit, type Store } from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";

import {
  AUTH_CONSTANTS,
  CHAT_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  PUBLIC_BOOKING_CONSTANTS,
} from "../constants/app.constants.js";
import { env } from "../config/env.js";
import { getRedis, redisKey } from "../infrastructure/redis/redis.js";

/**
 * Counts in Redis when it is configured, so limits hold across API
 * instances; otherwise (and in tests) each process counts in memory.
 */
function createStore(name: string): Store | undefined {
  const redis = env.NODE_ENV === "test" ? null : getRedis();

  if (!redis) return undefined;

  return new RedisStore({
    prefix: `${redisKey("rate-limit", name)}:`,
    sendCommand: (command: string, ...args: string[]) =>
      redis.call(command, ...args) as Promise<RedisReply>,
  });
}

function createRateLimiter(name: string, windowMs: number, limit: number) {
  const store = createStore(name);

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // A Redis outage should not lock everyone out.
    passOnStoreError: true,
    skip: () => env.NODE_ENV === "test",
    ...(store ? { store } : {}),
    handler(request, response) {
      response.status(429).json({
        error: {
          code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
          message: ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
          requestId: request.id,
        },
      });
    },
  });
}

export const authRateLimiter = createRateLimiter(
  "auth",
  AUTH_CONSTANTS.RATE_LIMIT_WINDOW_MS,
  AUTH_CONSTANTS.RATE_LIMIT_MAX_REQUESTS,
);

/** Actions that send email or SMS, or try one-time codes. */
export const sensitiveAuthRateLimiter = createRateLimiter(
  "auth-sensitive",
  AUTH_CONSTANTS.SENSITIVE_RATE_LIMIT_WINDOW_MS,
  AUTH_CONSTANTS.SENSITIVE_RATE_LIMIT_MAX_REQUESTS,
);

export const refreshRateLimiter = createRateLimiter(
  "auth-refresh",
  AUTH_CONSTANTS.REFRESH_RATE_LIMIT_WINDOW_MS,
  AUTH_CONSTANTS.REFRESH_RATE_LIMIT_MAX_REQUESTS,
);

/** Everything under /api/public, which anyone can call without signing in. */
export const publicRateLimiter = createRateLimiter(
  "public",
  PUBLIC_BOOKING_CONSTANTS.RATE_LIMIT_WINDOW_MS,
  PUBLIC_BOOKING_CONSTANTS.RATE_LIMIT_MAX_REQUESTS,
);

export const chatRateLimiter = createRateLimiter(
  "chat",
  CHAT_CONSTANTS.RATE_LIMIT_WINDOW_MS,
  CHAT_CONSTANTS.RATE_LIMIT_MAX_REQUESTS,
);
