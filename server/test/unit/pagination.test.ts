import { describe, expect, it } from "vitest";

import {
  decodeTimestampCursor,
  encodeTimestampCursor,
} from "../../src/utils/pagination.js";

const id = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

describe("timestamp cursor", () => {
  it("round-trips an id and timestamp", () => {
    const timestamp = new Date("2026-05-01T10:00:00.000Z");

    expect(decodeTimestampCursor(encodeTimestampCursor(id, timestamp))).toEqual({
      id,
      timestamp,
    });
  });

  it.each(["not-base64", Buffer.from("{}").toString("base64url")])(
    "rejects malformed cursor %s",
    (cursor) => {
      expect(decodeTimestampCursor(cursor)).toBeNull();
    },
  );
});
