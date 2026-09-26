import { randomUUID } from "node:crypto";

import { logger } from "../../config/logger.js";
import { env } from "../../config/env.js";
import {
  AUTH_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
} from "../../constants/app.constants.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { AppError } from "../../middleware/app-error.js";
import { createAccessToken } from "../../utils/jwt.js";
import { createOpaqueToken, hashSecret } from "../../utils/secure-token.js";
import { authDal } from "./dal/auth.dal.js";
import { refreshTokenDal, type RefreshTokenRecord } from "./dal/refresh-token.dal.js";
import type {
  AuthSession,
  AuthUserResponse,
  IssuedRefreshToken,
  PublicUserRecord,
  SessionOptions,
} from "./dto/auth.dto.js";

const MILLISECONDS_PER_HOUR = 3_600_000;
const MAX_USER_AGENT_LENGTH = 255;

export function toAuthUserResponse(user: PublicUserRecord): AuthUserResponse {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    emailVerified: user.emailVerifiedAt !== null,
    phone: user.phone,
    hasPassword: user.passwordHash !== null,
  };
}

/**
 * Sessions are a short-lived access token plus a rotating refresh token.
 * Each refresh swaps the presented token for a new one in the same family;
 * presenting a token that was already swapped means it was copied, so the
 * whole family is revoked.
 */
export class SessionService {
  public async startSession(user: PublicUserRecord, options: SessionOptions): Promise<AuthSession> {
    const refreshToken = await this.issueRefreshToken(user.id, randomUUID(), options);

    return this.toSession(user, refreshToken);
  }

  public async refresh(rawToken: string | undefined, userAgent: string | null): Promise<AuthSession> {
    if (!rawToken) this.throwSessionExpired();

    const now = new Date();
    const token = await refreshTokenDal.findByHash(hashSecret(rawToken));

    if (!token || token.revokedAt || token.expiresAt <= now) this.throwSessionExpired();

    if (token.rotatedAt) return this.handleReuse(token, now, userAgent);

    const session = await prisma.$transaction(async (transaction) => {
      if (!(await refreshTokenDal.markRotated(token.id, now, transaction))) return null;

      const user = await authDal.findUserById(token.userId, transaction);

      if (!user) return null;

      const next = await this.issueRefreshToken(
        token.userId,
        token.familyId,
        { persistent: token.persistent, userAgent },
        transaction,
        token.expiresAt,
      );

      return this.toSession(user, next);
    });

    // Lost a race with a parallel refresh of the same token.
    return session ?? this.refresh(rawToken, userAgent);
  }

  /** Ends the session the token belongs to; unknown tokens are ignored. */
  public async revoke(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;

    const token = await refreshTokenDal.findByHash(hashSecret(rawToken));

    if (token) await refreshTokenDal.revokeFamily(token.familyId);
  }

  public async revokeAllForUser(userId: string): Promise<void> {
    await refreshTokenDal.revokeAllForUser(userId);
  }

  private async handleReuse(
    token: RefreshTokenRecord,
    now: Date,
    userAgent: string | null,
  ): Promise<AuthSession> {
    const graceEndsAt =
      (token.rotatedAt?.getTime() ?? 0) + AUTH_CONSTANTS.REFRESH_REUSE_GRACE_SECONDS * 1_000;

    // Two tabs refreshing at once both present the same token; the loser
    // gets its own token in the family instead of logging everyone out.
    if (now.getTime() <= graceEndsAt) {
      const user = await authDal.findUserById(token.userId);

      if (user) {
        const sibling = await this.issueRefreshToken(
          token.userId,
          token.familyId,
          { persistent: token.persistent, userAgent },
          prisma,
          token.expiresAt,
        );

        return this.toSession(user, sibling);
      }
    }

    logger.warn({ userId: token.userId, familyId: token.familyId }, "Refresh token reuse detected");
    await refreshTokenDal.revokeFamily(token.familyId);

    return this.throwSessionExpired();
  }

  private async issueRefreshToken(
    userId: string,
    familyId: string,
    options: SessionOptions,
    client: Parameters<typeof refreshTokenDal.create>[1] = prisma,
    familyExpiresAt?: Date,
  ): Promise<IssuedRefreshToken> {
    const token = createOpaqueToken();
    // Rotation never extends a session past the original sign-in's lifetime.
    const expiresAt = familyExpiresAt ?? this.expiryFor(options.persistent);

    await refreshTokenDal.create(
      {
        userId,
        familyId,
        tokenHash: hashSecret(token),
        persistent: options.persistent,
        expiresAt,
        userAgent: options.userAgent?.slice(0, MAX_USER_AGENT_LENGTH) ?? null,
      },
      client,
    );

    return { token, expiresAt, persistent: options.persistent };
  }

  private expiryFor(persistent: boolean): Date {
    const hours = persistent
      ? AUTH_CONSTANTS.PERSISTENT_REFRESH_TTL_DAYS * 24
      : AUTH_CONSTANTS.SESSION_REFRESH_TTL_HOURS;

    return new Date(Date.now() + hours * MILLISECONDS_PER_HOUR);
  }

  private async toSession(user: PublicUserRecord, refreshToken: IssuedRefreshToken): Promise<AuthSession> {
    const accessToken = await createAccessToken({ subject: user.id, email: user.email });

    return {
      response: {
        user: toAuthUserResponse(user),
        accessToken,
        tokenType: AUTH_CONSTANTS.TOKEN_TYPE,
        expiresIn: env.JWT_ACCESS_TOKEN_TTL_SECONDS,
      },
      refreshToken,
    };
  }

  private throwSessionExpired(): never {
    throw new AppError(401, ERROR_CODES.SESSION_EXPIRED, ERROR_MESSAGES.SESSION_EXPIRED);
  }
}

export const sessionService = new SessionService();
