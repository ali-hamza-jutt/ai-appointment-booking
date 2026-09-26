import type { CookieOptions, Request, Response } from "express";

import { env } from "../../config/env.js";
import {
  AUTH_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
} from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import type { AuthSession, IssuedRefreshToken } from "./dto/auth.dto.js";
import type { GoogleAuthorizationState } from "./google-auth.service.js";

function baseCookieOptions(path: string): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

function responseOf(request: Request): Response {
  if (!request.res) throw new Error("Response is not available on the request");

  return request.res;
}

export function readRefreshCookie(request: Request): string | undefined {
  const value: unknown = request.cookies?.[AUTH_CONSTANTS.REFRESH_COOKIE_NAME];

  return typeof value === "string" && value ? value : undefined;
}

/** "Keep me signed in" sets an expiry; otherwise the cookie ends with the browser. */
export function setRefreshCookie(request: Request, token: IssuedRefreshToken): void {
  responseOf(request).cookie(AUTH_CONSTANTS.REFRESH_COOKIE_NAME, token.token, {
    ...baseCookieOptions(AUTH_CONSTANTS.REFRESH_COOKIE_PATH),
    ...(token.persistent ? { expires: token.expiresAt } : {}),
  });
}

export function clearRefreshCookie(request: Request): void {
  responseOf(request).clearCookie(
    AUTH_CONSTANTS.REFRESH_COOKIE_NAME,
    baseCookieOptions(AUTH_CONSTANTS.REFRESH_COOKIE_PATH),
  );
}

/** Sets the refresh cookie and returns the body for the client. */
export function respondWithSession(request: Request, session: AuthSession) {
  setRefreshCookie(request, session.refreshToken);

  return session.response;
}

export function setOAuthStateCookie(request: Request, state: GoogleAuthorizationState): void {
  responseOf(request).cookie(AUTH_CONSTANTS.OAUTH_STATE_COOKIE_NAME, JSON.stringify(state), {
    ...baseCookieOptions(AUTH_CONSTANTS.OAUTH_STATE_COOKIE_PATH),
    signed: true,
    maxAge: AUTH_CONSTANTS.OAUTH_STATE_TTL_SECONDS * 1_000,
  });
}

/** Reads and clears the OAuth state; null if missing or tampered with. */
export function takeOAuthStateCookie(request: Request): GoogleAuthorizationState | null {
  const raw: unknown = request.signedCookies?.[AUTH_CONSTANTS.OAUTH_STATE_COOKIE_NAME];

  responseOf(request).clearCookie(
    AUTH_CONSTANTS.OAUTH_STATE_COOKIE_NAME,
    baseCookieOptions(AUTH_CONSTANTS.OAUTH_STATE_COOKIE_PATH),
  );

  if (typeof raw !== "string") return null;

  try {
    const parsed = JSON.parse(raw) as Partial<GoogleAuthorizationState>;

    return typeof parsed.state === "string" &&
      typeof parsed.nonce === "string" &&
      typeof parsed.codeVerifier === "string"
      ? { state: parsed.state, nonce: parsed.nonce, codeVerifier: parsed.codeVerifier }
      : null;
  } catch {
    return null;
  }
}

/**
 * Cookie-authenticated endpoints only accept browser requests from the web
 * app. SameSite=Lax already blocks cross-site posts; this also rejects
 * other origins on the same site.
 */
export function assertTrustedOrigin(request: Request): void {
  const origin = request.get("origin");

  if (origin && origin !== new URL(env.WEB_ORIGIN).origin) {
    throw new AppError(403, ERROR_CODES.CROSS_SITE_REQUEST, ERROR_MESSAGES.CROSS_SITE_REQUEST);
  }
}

export function userAgentOf(request: Request): string | null {
  return request.get("user-agent") ?? null;
}
