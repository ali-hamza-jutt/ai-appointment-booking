import { describe, expect, it } from "vitest";

import { createSlotToken, readSlotToken } from "../../src/utils/slot-token.js";

const BUSINESS = "00000000-0000-4000-8000-00000000000a";
const SLOT = {
  businessId: BUSINESS,
  serviceId: "00000000-0000-4000-8000-00000000000b",
  staffId: "00000000-0000-4000-8000-00000000000c",
  startsAt: new Date("2026-11-03T10:00:00.000Z"),
};
const NOW = new Date("2026-11-02T08:00:00.000Z");

describe("slot tokens", () => {
  it("round-trips the offered slot", () => {
    expect(readSlotToken(createSlotToken(SLOT, NOW), BUSINESS, NOW)).toEqual(SLOT);
  });

  it("rejects tampered, foreign and expired tokens", () => {
    const token = createSlotToken(SLOT, NOW);
    const [payload, signature] = token.split(".") as [string, string];
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), t: "2026-11-03T11:00:00.000Z" }),
    ).toString("base64url");

    expect(readSlotToken(`${forged}.${signature}`, BUSINESS, NOW)).toBeNull();
    expect(readSlotToken(`${payload}.${signature}x`, BUSINESS, NOW)).toBeNull();
    expect(readSlotToken(token, "00000000-0000-4000-8000-0000000000ff", NOW)).toBeNull();
    expect(readSlotToken(token, BUSINESS, new Date(NOW.getTime() + 31 * 60_000))).toBeNull();
    expect(readSlotToken("not a token", BUSINESS, NOW)).toBeNull();
  });
});
