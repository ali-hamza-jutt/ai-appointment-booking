import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The Stripe-Signature header for a payload: "t=<unix seconds>,v1=<hex
 * HMAC-SHA256 of "<t>.<payload>" keyed by the endpoint secret>".
 */
export function stripeSignatureHeader(payload: string, secret: string, timestamp: number): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");

  return `t=${timestamp},v1=${signature}`;
}

/**
 * True when one of the header's v1 signatures matches the raw payload and
 * its timestamp is recent enough to rule out a replay.
 */
export function isValidStripeSignature(
  payload: string,
  header: string | undefined,
  secret: string,
  nowSeconds: number,
  toleranceSeconds: number,
): boolean {
  if (!header) return false;

  const parts = header.split(",").map((part) => part.trim().split("="));
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value ?? "");

  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;

  const expected = Buffer.from(
    createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex"),
  );

  return signatures.some((signature) => {
    const received = Buffer.from(signature);

    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}
