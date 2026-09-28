import { randomUUID } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

import { AUTH_CONSTANTS } from "../constants/app.constants.js";
import { env } from "../config/env.js";

const jwtSecret = new TextEncoder().encode(env.JWT_SECRET);

export interface AccessTokenClaims {
  subject: string;
  email: string;
  /** The platform admin acting as this user, when the token is for impersonation. */
  impersonatorId?: string;
}

export async function createAccessToken(
  claims: AccessTokenClaims,
  ttlSeconds: number = env.JWT_ACCESS_TOKEN_TTL_SECONDS,
): Promise<string> {
  return new SignJWT({
    email: claims.email,
    tokenType: "access",
    ...(claims.impersonatorId ? { imp: claims.impersonatorId } : {}),
  })
    .setProtectedHeader({
      alg: AUTH_CONSTANTS.JWT_ALGORITHM,
      typ: "JWT",
    })
    .setSubject(claims.subject)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1_000) + ttlSeconds)
    .sign(jwtSecret);
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, jwtSecret, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    algorithms: [AUTH_CONSTANTS.JWT_ALGORITHM],
  });

  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    payload.tokenType !== "access"
  ) {
    throw new Error("Access token contains invalid claims");
  }

  return {
    subject: payload.sub,
    email: payload.email,
    ...(typeof payload.imp === "string" ? { impersonatorId: payload.imp } : {}),
  };
}

export function extractBearerToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token, ...extraParts] = authorizationHeader.trim().split(/\s+/);

  if (
    scheme?.toLowerCase() !== "bearer" ||
    !token ||
    extraParts.length > 0
  ) {
    return null;
  }

  return token;
}
