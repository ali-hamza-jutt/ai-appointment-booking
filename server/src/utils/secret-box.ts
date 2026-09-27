import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;

/**
 * AES-256-GCM with a random IV per message. The result is
 * "v1.<iv>.<auth tag>.<ciphertext>" in base64url, safe to store or put in a URL.
 */
export function sealSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

/** The plaintext, or null when the value was not sealed with this key or was altered. */
export function openSecret(sealed: string, key: Buffer): string | null {
  const [version, iv, tag, ciphertext, ...rest] = sealed.split(".");

  if (version !== VERSION || !iv || !tag || ciphertext === undefined || rest.length > 0) return null;

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));

    decipher.setAuthTag(Buffer.from(tag, "base64url"));

    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
