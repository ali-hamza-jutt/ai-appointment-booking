import { rateLimit } from "express-rate-limit";

import {
  AUTH_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
} from "../constants/app.constants.js";

export const authRateLimiter = rateLimit({
  windowMs: AUTH_CONSTANTS.RATE_LIMIT_WINDOW_MS,
  limit: AUTH_CONSTANTS.RATE_LIMIT_MAX_REQUESTS,
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
