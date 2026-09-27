import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { busyFingerprint, mergeBusyIntervals } from "../../src/modules/calendar/busy-intervals.js";
import { openSecret, sealSecret } from "../../src/utils/secret-box.js";

const key = randomBytes(32);
const at = (time: string) => new Date(`2026-10-06T${time}:00Z`);
const range = { from: at("08:00"), to: at("18:00") };

describe("secret box", () => {
  it("opens what it sealed, and nothing else", () => {
    const sealed = sealSecret("refresh-token-123", key);

    expect(sealed).not.toContain("refresh-token-123");
    expect(sealed).not.toBe(sealSecret("refresh-token-123", key));
    expect(openSecret(sealed, key)).toBe("refresh-token-123");
    expect(openSecret(sealed, randomBytes(32))).toBeNull();
    const [version, iv, tag, ciphertext] = sealed.split(".") as [string, string, string, string];
    const tampered = [version, iv, `${tag.startsWith("A") ? "B" : "A"}${tag.slice(1)}`, ciphertext].join(".");

    expect(openSecret(tampered, key)).toBeNull();
    expect(openSecret("not-sealed", key)).toBeNull();
  });
});

describe("mergeBusyIntervals", () => {
  it("joins overlapping and touching times and clips them to the range", () => {
    expect(
      mergeBusyIntervals(
        [
          { startsAt: at("13:00"), endsAt: at("14:00") },
          { startsAt: at("07:00"), endsAt: at("09:00") },
          { startsAt: at("10:00"), endsAt: at("11:00") },
          { startsAt: at("10:30"), endsAt: at("12:00") },
          { startsAt: at("12:00"), endsAt: at("12:30") },
          { startsAt: at("17:30"), endsAt: at("19:00") },
          { startsAt: at("19:00"), endsAt: at("20:00") },
        ],
        range,
      ),
    ).toEqual([
      { startsAt: at("08:00"), endsAt: at("09:00") },
      { startsAt: at("10:00"), endsAt: at("12:30") },
      { startsAt: at("13:00"), endsAt: at("14:00") },
      { startsAt: at("17:30"), endsAt: at("18:00") },
    ]);
  });

  it("gives the same fingerprint for the same busy times in any order", () => {
    const a = mergeBusyIntervals(
      [
        { startsAt: at("10:00"), endsAt: at("11:00") },
        { startsAt: at("13:00"), endsAt: at("14:00") },
      ],
      range,
    );
    const b = mergeBusyIntervals(
      [
        { startsAt: at("13:00"), endsAt: at("14:00") },
        { startsAt: at("10:00"), endsAt: at("11:00") },
      ],
      range,
    );

    expect(busyFingerprint(a)).toBe(busyFingerprint(b));
    expect(busyFingerprint(a)).not.toBe(busyFingerprint(a.slice(1)));
  });
});
