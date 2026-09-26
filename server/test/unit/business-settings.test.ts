import { describe, expect, it } from "vitest";

import {
  mergeBusinessSettings,
  parseStoredBusinessSettings,
} from "../../src/modules/businesses/business-settings.js";
import { slugify } from "../../src/utils/text.js";

describe("business settings", () => {
  it("fills defaults for an empty settings object", () => {
    expect(parseStoredBusinessSettings({})).toMatchObject({
      bookingWindowDays: 60,
      minimumNoticeMinutes: 120,
      slotStepMinutes: 15,
      holdMinutes: 10,
    });
  });

  it("falls back to defaults when stored settings are malformed", () => {
    expect(parseStoredBusinessSettings("oops").slotStepMinutes).toBe(15);
  });

  it("merges a partial update onto current settings", () => {
    const current = parseStoredBusinessSettings({});
    const merged = mergeBusinessSettings(current, { slotStepMinutes: 30 });

    expect(merged.slotStepMinutes).toBe(30);
    expect(merged.bookingWindowDays).toBe(current.bookingWindowDays);
  });

  it("rejects out-of-range values with a field error", () => {
    expect(() =>
      mergeBusinessSettings(parseStoredBusinessSettings({}), {
        slotStepMinutes: 1,
      }),
    ).toThrowError(
      expect.objectContaining({
        statusCode: 422,
        fieldErrors: { slotStepMinutes: expect.any(Array) },
      }),
    );
  });
});

describe("slugify", () => {
  it.each([
    ["Glow & Go Salon", "glow-go-salon"],
    ["  Café Déjà Vu ", "cafe-deja-vu"],
    ["---", ""],
  ])("turns %j into %j", (input, expected) => {
    expect(slugify(input, 60)).toBe(expected);
  });

  it("never ends with a hyphen after truncation", () => {
    expect(slugify("abc def", 4)).toBe("abc");
  });
});

describe("booking policy resolution", () => {
  it("keeps business settings when a service has no overrides", async () => {
    const { resolveBookingPolicy } = await import("../../src/modules/bookings/booking-policy.js");
    const policy = resolveBookingPolicy(
      { cancellationWindowHours: 720, rescheduleLimit: 1, minimumNoticeMinutes: 0 },
      {},
    );

    expect(policy).toMatchObject({
      cancellationWindowHours: 720,
      rescheduleLimit: 1,
      minimumNoticeMinutes: 0,
    });
  });

  it("applies per-service overrides and ignores unknown keys", async () => {
    const { resolveBookingPolicy } = await import("../../src/modules/bookings/booking-policy.js");

    expect(
      resolveBookingPolicy({ minimumNoticeMinutes: 0 }, { minimumNoticeMinutes: 1_440 })
        .minimumNoticeMinutes,
    ).toBe(1_440);
    expect(resolveBookingPolicy({}, { holdMinutes: 1 }).holdMinutes).toBe(10);
  });
});
