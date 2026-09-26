import type { Request } from "express";

import {
  AUTH_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
} from "../constants/app.constants.js";
import type { AuthenticatedUser } from "../models/authenticated-user.js";
import { AppError } from "./app-error.js";
import { authorizeScopes } from "./authorization.js";
import {
  extractBearerToken,
  verifyAccessToken,
} from "../utils/jwt.js";

export async function expressAuthentication(
  request: Request,
  securityName: string,
  scopes: string[] = [],
): Promise<AuthenticatedUser> {
  if (securityName !== AUTH_CONSTANTS.SECURITY_NAME) {
    throw new AppError(
      401,
      ERROR_CODES.UNSUPPORTED_AUTHENTICATION,
      ERROR_MESSAGES.UNSUPPORTED_AUTHENTICATION,
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

  let user: AuthenticatedUser;

  try {
    const claims = await verifyAccessToken(token);

    user = {
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

  return scopes.length > 0 ? authorizeScopes(request, user, scopes) : user;
}
