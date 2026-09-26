import { describe, expect, it } from "vitest";

import {
  getLocalDateTimeValues,
  localDateTimeToUtc,
  normalizeIanaTimeZone,
} from "../../src/utils/time-zone.js";

describe("normalizeIanaTimeZone", () => {
  it.each([
    ["Europe/London", "Europe/London"],
    ["  Asia/Karachi  ", "Asia/Karachi"],
    ["Mars/Olympus", null],
    ["", null],
    [42, null],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeIanaTimeZone(input)).toBe(expected);
  });
});

describe("localDateTimeToUtc", () => {
  it.each([
    ["2026-01-15", "09:00", "Europe/London", "2026-01-15T09:00:00.000Z"],
    ["2026-07-15", "09:00", "Europe/London", "2026-07-15T08:00:00.000Z"],
    ["2026-03-10", "14:30", "Asia/Karachi", "2026-03-10T09:30:00.000Z"],
    ["2026-11-02", "09:00", "America/New_York", "2026-11-02T14:00:00.000Z"],
  ])("converts %s %s in %s", (date, time, timeZone, expected) => {
    expect(localDateTimeToUtc(date, time, timeZone)?.toISOString()).toBe(
      expected,
    );
  });

  it("rejects a wall time inside the spring-forward gap", () => {
    expect(localDateTimeToUtc("2026-03-29", "01:30", "Europe/London")).toBeNull();
  });

  it("rejects an ambiguous wall time inside the autumn fold", () => {
    expect(localDateTimeToUtc("2026-10-25", "01:30", "Europe/London")).toBeNull();
  });

  it("rejects impossible calendar dates", () => {
    expect(localDateTimeToUtc("2026-02-30", "10:00", "UTC")).toBeNull();
  });
});

describe("getLocalDateTimeValues", () => {
  it("formats an instant in the requested zone", () => {
    expect(
      getLocalDateTimeValues(
        new Date("2026-07-15T08:00:00.000Z"),
        "Europe/London",
      ),
    ).toEqual({ date: "2026-07-15", time: "09:00" });
  });
});
