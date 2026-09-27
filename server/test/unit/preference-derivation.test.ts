import { describe, expect, it } from "vitest";

import type { CustomerHistoryVisit } from "../../src/modules/customers/dto/customer-profile.dto.js";
import { derivePreferences, partOfDayOf } from "../../src/modules/customers/preference-derivation.js";

const HAIRCUT = "11111111-1111-4111-8111-111111111111";
const BEARD = "22222222-2222-4222-8222-222222222222";
const SANA = "33333333-3333-4333-8333-333333333333";
const OMAR = "44444444-4444-4444-8444-444444444444";

function visit(serviceId: string | null, staffId: string | null, at: string, timeZone = "UTC"): CustomerHistoryVisit {
  return { serviceId, staffId, scheduledAt: new Date(at), timeZone };
}

describe("derivePreferences", () => {
  it("derives nothing from a single visit", () => {
    expect(derivePreferences([visit(HAIRCUT, SANA, "2026-10-06T10:00:00Z")])).toEqual({});
  });

  it("picks the service, provider and part of day that repeat", () => {
    expect(
      derivePreferences([
        visit(HAIRCUT, SANA, "2026-10-20T10:00:00Z"),
        visit(BEARD, OMAR, "2026-10-13T15:00:00Z"),
        visit(HAIRCUT, SANA, "2026-10-06T09:00:00Z"),
      ]),
    ).toEqual({ USUAL_SERVICE: HAIRCUT, PREFERRED_STAFF: SANA, PREFERRED_PART_OF_DAY: "morning" });
  });

  it("breaks a tie in favour of the most recent visit", () => {
    expect(
      derivePreferences([
        visit(BEARD, OMAR, "2026-10-27T18:00:00Z"),
        visit(HAIRCUT, SANA, "2026-10-20T10:00:00Z"),
        visit(BEARD, OMAR, "2026-10-13T18:30:00Z"),
        visit(HAIRCUT, SANA, "2026-10-06T10:00:00Z"),
      ]),
    ).toEqual({ USUAL_SERVICE: BEARD, PREFERRED_STAFF: OMAR, PREFERRED_PART_OF_DAY: "evening" });
  });

  it("ignores visits whose provider or service is gone", () => {
    expect(
      derivePreferences([
        visit(null, null, "2026-10-20T13:00:00Z"),
        visit(null, null, "2026-10-13T13:00:00Z"),
      ]),
    ).toEqual({ PREFERRED_PART_OF_DAY: "afternoon" });
  });
});

describe("partOfDayOf", () => {
  it("reads the time in the zone the visit was booked in", () => {
    // 09:00 UTC is 14:00 in Karachi.
    expect(partOfDayOf({ scheduledAt: new Date("2026-10-06T09:00:00Z"), timeZone: "Asia/Karachi" })).toBe(
      "afternoon",
    );
    expect(partOfDayOf({ scheduledAt: new Date("2026-10-06T09:00:00Z"), timeZone: "UTC" })).toBe("morning");
  });
});
