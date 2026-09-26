import { createRemoteJWKSet, jwtVerify } from "jose";

import { env } from "../../config/env.js";
import { AUTH_CONSTANTS } from "../../constants/app.constants.js";
import type { GoogleProfile } from "./dto/auth.dto.js";

export interface GoogleCodeExchange {
  code: string;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
}

/** Turns an authorization code into a verified Google identity. */
export interface GoogleIdentityClient {
  exchangeCode(exchange: GoogleCodeExchange): Promise<GoogleProfile>;
}

export class GoogleIdentityError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "GoogleIdentityError";
  }
}

export class HttpGoogleIdentityClient implements GoogleIdentityClient {
  private readonly jwks = createRemoteJWKSet(new URL(AUTH_CONSTANTS.GOOGLE_JWKS_URL));

  public constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  public async exchangeCode(exchange: GoogleCodeExchange): Promise<GoogleProfile> {
    const response = await fetch(AUTH_CONSTANTS.GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: exchange.code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: exchange.redirectUri,
        grant_type: "authorization_code",
        code_verifier: exchange.codeVerifier,
      }),
      signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) throw new GoogleIdentityError(`Token exchange failed with ${response.status}`);

    const body = (await response.json()) as { id_token?: unknown };

    if (typeof body.id_token !== "string") throw new GoogleIdentityError("No ID token returned");

    const { payload } = await jwtVerify(body.id_token, this.jwks, {
      issuer: [...AUTH_CONSTANTS.GOOGLE_ISSUERS],
      audience: this.clientId,
    });

    if (payload.nonce !== exchange.nonce) throw new GoogleIdentityError("ID token nonce mismatch");
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      throw new GoogleIdentityError("ID token is missing the subject or email");
    }

    return {
      subject: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      fullName: typeof payload.name === "string" && payload.name.trim() ? payload.name : payload.email,
    };
  }
}
