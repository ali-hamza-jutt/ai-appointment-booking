import type { Request } from "express";

import {
  AUTH_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
} from "../constants/app.constants.js";
import { AppError } from "./app-error.js";
import {
  extractBearerToken,
  verifyAccessToken,
} from "../utils/jwt.js";

export async function expressAuthentication(
  request: Request,
  securityName: string,
  scopes: string[] = [],
): Promise<{ id: string; email: string }> {
  if (securityName !== AUTH_CONSTANTS.SECURITY_NAME) {
    throw new AppError(
      401,
      ERROR_CODES.UNSUPPORTED_AUTHENTICATION,
      ERROR_MESSAGES.UNSUPPORTED_AUTHENTICATION,
    );
  }

  if (scopes.length > 0) {
    throw new AppError(
      403,
      ERROR_CODES.INSUFFICIENT_SCOPE,
      ERROR_MESSAGES.INSUFFICIENT_SCOPE,
    );
  }

  const token = extractBearerToken(request.header("authorization"));

  if (!token) {
    throw new AppError(
      401,
      ERROR_CODES.INVALID_TOKEN,
      ERROR_MESSAGES.INVALID_TOKEN,
    );
  }

  try {
    const claims = await verifyAccessToken(token);

    return {
      id: claims.subject,
      email: claims.email,
    };
  } catch {
    throw new AppError(
      401,
      ERROR_CODES.INVALID_TOKEN,
      ERROR_MESSAGES.INVALID_TOKEN,
    );
  }
}
