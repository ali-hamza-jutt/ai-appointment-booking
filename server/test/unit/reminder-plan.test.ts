import { describe, expect, it } from "vitest";

import { outsideQuietHours, planReminders } from "../../src/modules/notifications/reminder-plan.js";

const NIGHT = { start: "21:00", end: "08:00" };
const at = (iso: string) => new Date(iso);

describe("planReminders", () => {
  it("plans one reminder per distinct offset, earliest first", () => {
    expect(
      planReminders(at("2026-10-08T15:00:00Z"), [120, 1_440, 1_440], NIGHT, "UTC", at("2026-10-05T12:00:00Z")),
    ).toEqual([
      { offsetMinutes: 1_440, sendAt: at("2026-10-07T15:00:00Z") },
      { offsetMinutes: 120, sendAt: at("2026-10-08T13:00:00Z") },
    ]);
  });

  it("drops reminders that are already due", () => {
    expect(
      planReminders(at("2026-10-08T15:00:00Z"), [1_440, 120], NIGHT, "UTC", at("2026-10-08T10:00:00Z")),
    ).toEqual([{ offsetMinutes: 120, sendAt: at("2026-10-08T13:00:00Z") }]);
    expect(planReminders(at("2026-10-08T15:00:00Z"), [1_440, 120], NIGHT, "UTC", at("2026-10-08T14:00:00Z"))).toEqual(
      [],
    );
  });

  it("moves a reminder due at night to when quiet hours began", () => {
    // 2 hours before an 8 am visit is 6 am, so it goes out at 9 pm the evening before.
    expect(planReminders(at("2026-10-08T08:00:00Z"), [120], NIGHT, "UTC", at("2026-10-05T12:00:00Z"))).toEqual([
      { offsetMinutes: 120, sendAt: at("2026-10-07T21:00:00Z") },
    ]);
  });
});

describe("outsideQuietHours", () => {
  const now = at("2026-10-01T00:00:00Z");

  it("leaves times outside quiet hours alone", () => {
    expect(outsideQuietHours(at("2026-10-07T12:00:00Z"), NIGHT, "UTC", now)).toEqual(at("2026-10-07T12:00:00Z"));
  });

  it("handles quiet hours before and after midnight", () => {
    expect(outsideQuietHours(at("2026-10-07T23:30:00Z"), NIGHT, "UTC", now)).toEqual(at("2026-10-07T21:00:00Z"));
    expect(outsideQuietHours(at("2026-10-08T03:00:00Z"), NIGHT, "UTC", now)).toEqual(at("2026-10-07T21:00:00Z"));
  });

  it("reads quiet hours in the customer's time zone", () => {
    // 01:00 UTC is 06:00 in Karachi, so the reminder moves to 21:00 there (16:00 UTC).
    expect(outsideQuietHours(at("2026-10-08T01:00:00Z"), NIGHT, "Asia/Karachi", now)).toEqual(
      at("2026-10-07T16:00:00Z"),
    );
  });

  it("handles quiet hours within one day", () => {
    expect(outsideQuietHours(at("2026-10-07T13:30:00Z"), { start: "13:00", end: "14:00" }, "UTC", now)).toEqual(
      at("2026-10-07T13:00:00Z"),
    );
  });

  it("keeps the original time when quiet hours began in the past", () => {
    expect(outsideQuietHours(at("2026-10-08T06:00:00Z"), NIGHT, "UTC", at("2026-10-07T22:00:00Z"))).toEqual(
      at("2026-10-08T06:00:00Z"),
    );
  });

  it("does nothing when quiet hours are off", () => {
    expect(outsideQuietHours(at("2026-10-08T03:00:00Z"), { start: "00:00", end: "00:00" }, "UTC", now)).toEqual(
      at("2026-10-08T03:00:00Z"),
    );
  });
});
