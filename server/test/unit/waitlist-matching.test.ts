import { describe, expect, it } from "vitest";

import { suitsWaitlistEntry } from "../../src/modules/waitlist/waitlist-matching.js";

const entry = {
  fromDate: "2026-10-06",
  toDate: "2026-10-08",
  partOfDay: null,
  timeZone: "UTC",
  staffId: null,
};
const at = (iso: string) => new Date(iso);

describe("suitsWaitlistEntry", () => {
  it("accepts a time on one of the entry's dates, including the last", () => {
    expect(suitsWaitlistEntry(entry, { startsAt: at("2026-10-06T09:00:00Z"), staffId: "s1" })).toBe(true);
    expect(suitsWaitlistEntry(entry, { startsAt: at("2026-10-08T23:30:00Z"), staffId: null })).toBe(true);
    expect(suitsWaitlistEntry(entry, { startsAt: at("2026-10-09T00:30:00Z"), staffId: null })).toBe(false);
    expect(suitsWaitlistEntry(entry, { startsAt: at("2026-10-05T23:59:00Z"), staffId: null })).toBe(false);
  });

  it("reads the date in the customer's time zone", () => {
    // 23:30 UTC on the 8th is already the 9th in Karachi.
    const karachi = { ...entry, timeZone: "Asia/Karachi" };

    expect(suitsWaitlistEntry(karachi, { startsAt: at("2026-10-08T23:30:00Z"), staffId: null })).toBe(false);
    expect(suitsWaitlistEntry(karachi, { startsAt: at("2026-10-05T20:00:00Z"), staffId: null })).toBe(true);
  });

  it("keeps to the part of the day the customer asked for", () => {
    const mornings = { ...entry, partOfDay: "morning" };

    expect(suitsWaitlistEntry(mornings, { startsAt: at("2026-10-07T10:00:00Z"), staffId: null })).toBe(true);
    expect(suitsWaitlistEntry(mornings, { startsAt: at("2026-10-07T14:00:00Z"), staffId: null })).toBe(false);
  });

  it("keeps to the provider the customer asked for", () => {
    const withSana = { ...entry, staffId: "sana" };

    expect(suitsWaitlistEntry(withSana, { startsAt: at("2026-10-07T10:00:00Z"), staffId: "sana" })).toBe(true);
    expect(suitsWaitlistEntry(withSana, { startsAt: at("2026-10-07T10:00:00Z"), staffId: "omar" })).toBe(false);
  });
});
