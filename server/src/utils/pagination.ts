import { VALIDATION_PATTERNS } from "../constants/app.constants.js";

export function encodeTimestampCursor(id: string, timestamp: Date): string {
  return Buffer.from(
    JSON.stringify({
      id,
      timestamp: timestamp.toISOString(),
    }),
  ).toString("base64url");
}

export function decodeTimestampCursor(cursor: string) {
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { id?: unknown; timestamp?: unknown };

    if (
      typeof value.id !== "string" ||
      !VALIDATION_PATTERNS.UUID.test(value.id) ||
      typeof value.timestamp !== "string"
    ) {
      return null;
    }

    const timestamp = new Date(value.timestamp);

    if (Number.isNaN(timestamp.getTime())) {
      return null;
    }

    return {
      id: value.id,
      timestamp,
    };
  } catch {
    return null;
  }
}
