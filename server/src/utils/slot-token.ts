import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../config/env.js";
import { AGENT_CONSTANTS } from "../constants/app.constants.js";

/** What an offered slot commits to. */
export interface SlotTokenPayload {
  businessId: string;
  serviceId: string;
  /** Provider offered for the slot; null lets booking core pick. */
  staffId: string | null;
  startsAt: Date;
}

interface EncodedPayload {
  b: string;
  s: string;
  p: string | null;
  t: string;
  e: number;
}

const signingKey = createHmac("sha256", env.JWT_SECRET).update("bookwise-slot-token").digest();

function sign(encodedPayload: string): string {
  return createHmac("sha256", signingKey).update(encodedPayload).digest("base64url");
}

/**
 * Signs an offered slot. Only times the availability engine returned get a
 * token, so a model (or client) cannot book a time that was never offered.
 */
export function createSlotToken(
  payload: SlotTokenPayload,
  now: Date = new Date(),
  ttlMinutes: number = AGENT_CONSTANTS.SLOT_TOKEN_TTL_MINUTES,
): string {
  const encoded = Buffer.from(
    JSON.stringify({
      b: payload.businessId,
      s: payload.serviceId,
      p: payload.staffId,
      t: payload.startsAt.toISOString(),
      e: now.getTime() + ttlMinutes * 60_000,
    } satisfies EncodedPayload),
  ).toString("base64url");

  return `${encoded}.${sign(encoded)}`;
}

/** The slot a token stands for, or null when it is forged, expired or for another business. */
export function readSlotToken(
  token: string,
  businessId: string,
  now: Date = new Date(),
): SlotTokenPayload | null {
  const [encoded, signature, ...rest] = token.trim().split(".");

  if (!encoded || !signature || rest.length > 0) return null;

  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(signature);

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  let payload: EncodedPayload;

  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as EncodedPayload;
  } catch {
    return null;
  }

  const startsAt = new Date(payload.t);

  if (payload.b !== businessId || payload.e <= now.getTime() || Number.isNaN(startsAt.getTime())) {
    return null;
  }

  return { businessId: payload.b, serviceId: payload.s, staffId: payload.p, startsAt };
}
