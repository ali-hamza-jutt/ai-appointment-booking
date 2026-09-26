import { createHash } from "node:crypto";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import {
  AUTH_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
} from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import { createOpaqueToken } from "../../utils/secure-token.js";
import { normalizeEmail, normalizeFullName } from "../../utils/text.js";
import { memberService } from "../businesses/member.service.js";
import { authDal } from "./dal/auth.dal.js";
import type { AuthSession, GoogleProfile, PublicUserRecord } from "./dto/auth.dto.js";
import {
  GoogleIdentityError,
  HttpGoogleIdentityClient,
  type GoogleIdentityClient,
} from "./google-identity.client.js";
import { sessionService } from "./session.service.js";

/** Kept in a signed, httpOnly cookie between the redirect and the callback. */
export interface GoogleAuthorizationState {
  state: string;
  nonce: string;
  codeVerifier: string;
}

const MAX_NAME_LENGTH = 80;

export const GOOGLE_REDIRECT_URI = new URL("/api/auth/google/callback", env.API_PUBLIC_URL).toString();

export class GoogleAuthService {
  public constructor(private readonly client: GoogleIdentityClient | null) {}

  public get isConfigured(): boolean {
    return this.client !== null;
  }

  /** The Google consent URL and the state to remember for the callback. */
  public createAuthorization(): { url: string; state: GoogleAuthorizationState } {
    if (!env.GOOGLE_CLIENT_ID || !this.client) this.throwNotConfigured();

    const state: GoogleAuthorizationState = {
      state: createOpaqueToken(),
      nonce: createOpaqueToken(),
      codeVerifier: createOpaqueToken(),
    };
    const url = new URL(AUTH_CONSTANTS.GOOGLE_AUTHORIZE_URL);

    url.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: AUTH_CONSTANTS.GOOGLE_SCOPES,
      state: state.state,
      nonce: state.nonce,
      code_challenge: createHash("sha256").update(state.codeVerifier).digest("base64url"),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();

    return { url: url.toString(), state };
  }

  public async completeSignIn(
    callback: { code: string | undefined; state: string | undefined },
    stored: GoogleAuthorizationState | null,
    userAgent: string | null,
  ): Promise<AuthSession> {
    if (!this.client) this.throwNotConfigured();

    if (!callback.code || !stored || callback.state !== stored.state) {
      throw new GoogleIdentityError("OAuth state mismatch");
    }

    const profile = await this.client.exchangeCode({
      code: callback.code,
      codeVerifier: stored.codeVerifier,
      nonce: stored.nonce,
      redirectUri: GOOGLE_REDIRECT_URI,
    });
    const user = await this.resolveUser(profile);

    return sessionService.startSession(user, { persistent: true, userAgent });
  }

  /** Finds the account for a Google identity, linking or creating one as needed. */
  public async resolveUser(profile: GoogleProfile): Promise<PublicUserRecord> {
    const email = normalizeEmail(profile.email);
    const matches = await authDal.findGoogleUser(profile.subject, email);
    const linked = matches.find((user) => user.googleSubject === profile.subject);

    if (linked) return linked;

    const byEmail = matches.find((user) => user.email === email);

    if (byEmail) {
      // Only an address Google has verified may take over an existing account.
      if (!profile.emailVerified || byEmail.googleSubject) {
        throw new GoogleIdentityError("Google account cannot be linked to this email");
      }

      // If the address was never verified here, someone else may have
      // registered it; drop that password and its sessions before linking.
      const unverified = byEmail.emailVerifiedAt === null;
      const user = await authDal.updateUser(byEmail.id, {
        googleSubject: profile.subject,
        emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
        ...(unverified ? { passwordHash: null } : {}),
      });

      if (unverified) await sessionService.revokeAllForUser(user.id);

      return user;
    }

    const fullName = normalizeFullName(profile.fullName).slice(0, MAX_NAME_LENGTH);
    const user = await authDal.createUser({
      email,
      fullName: fullName.length >= 2 ? fullName : email.slice(0, MAX_NAME_LENGTH),
      passwordHash: null,
      googleSubject: profile.subject,
      ...(profile.emailVerified ? { emailVerifiedAt: new Date() } : {}),
    });

    await memberService.acceptPendingInvitations(user.id, user.email);
    logger.info({ userId: user.id }, "Account created with Google");

    return user;
  }

  private throwNotConfigured(): never {
    throw new AppError(404, ERROR_CODES.GOOGLE_NOT_CONFIGURED, ERROR_MESSAGES.GOOGLE_NOT_CONFIGURED);
  }
}

export const googleAuthService = new GoogleAuthService(
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? new HttpGoogleIdentityClient(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
    : null,
);
