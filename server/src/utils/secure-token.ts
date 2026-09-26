import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { AUTH_CONSTANTS } from "../constants/app.constants.js";
import { env } from "../config/env.js";

/** An unguessable URL-safe token for links and refresh cookies. */
export function createOpaqueToken(): string {
  return randomBytes(AUTH_CONSTANTS.TOKEN_BYTES).toString("base64url");
}

/** A numeric one-time code, for example for SMS. */
export function createNumericCode(length: number = AUTH_CONSTANTS.PHONE_CODE_LENGTH): string {
  return Array.from({ length }, () => randomInt(10)).join("");
}

/**
 * Keyed hash stored in place of a token or code. Keying with the server
 * secret stops a leaked table from being brute-forced offline, which
 * matters for short numeric codes.
 */
export function hashSecret(value: string): string {
  return createHmac("sha256", env.JWT_SECRET).update(value).digest("hex");
}

export function secretMatches(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashSecret(value), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
