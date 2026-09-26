import { describe, expect, it } from "vitest";

import {
  createAccessToken,
  extractBearerToken,
  verifyAccessToken,
} from "../../src/utils/jwt.js";

describe("extractBearerToken", () => {
  it.each([
    ["Bearer abc", "abc"],
    ["bearer abc", "abc"],
    ["Basic abc", null],
    ["Bearer a b", null],
    [undefined, null],
  ])("parses %j", (header, expected) => {
    expect(extractBearerToken(header)).toBe(expected);
  });
});

describe("access tokens", () => {
  it("verifies a token it issued", async () => {
    const token = await createAccessToken({
      subject: "user-1",
      email: "user@example.com",
    });

    await expect(verifyAccessToken(token)).resolves.toEqual({
      subject: "user-1",
      email: "user@example.com",
    });
  });

  it("rejects a tampered token", async () => {
    const token = await createAccessToken({
      subject: "user-1",
      email: "user@example.com",
    });

    await expect(verifyAccessToken(`${token}x`)).rejects.toThrow();
  });
});
