import { rateLimit } from "express-rate-limit";

import {
  AUTH_CONSTANTS,
  CHAT_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
} from "../constants/app.constants.js";

function createRateLimiter(windowMs: number, limit: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
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
  AUTH_CONSTANTS.RATE_LIMIT_WINDOW_MS,
  AUTH_CONSTANTS.RATE_LIMIT_MAX_REQUESTS,
);

export const chatRateLimiter = createRateLimiter(
  CHAT_CONSTANTS.RATE_LIMIT_WINDOW_MS,
  CHAT_CONSTANTS.RATE_LIMIT_MAX_REQUESTS,
);
