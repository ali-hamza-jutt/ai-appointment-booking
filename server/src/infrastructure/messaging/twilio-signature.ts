import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio's request signature: HMAC-SHA1, keyed by the auth token, over the
 * full callback URL followed by every POST parameter (name then value)
 * sorted by name, base64 encoded.
 */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((text, key) => `${text}${key}${params[key] ?? ""}`, url);

  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function isValidTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | undefined,
): boolean {
  if (!signature) return false;

  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const received = Buffer.from(signature);

  return expected.length === received.length && timingSafeEqual(expected, received);
}
