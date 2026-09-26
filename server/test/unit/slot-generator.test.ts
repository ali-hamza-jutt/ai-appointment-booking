import { describe, expect, it } from "vitest";

import {
  generateSlots,
  maxConcurrency,
  subtractIntervals,
  type ProviderSchedule,
  type SlotGeneratorInput,
} from "../../src/modules/availability/slot-generator.js";
import { getTimeZoneOffsetMinutes, wallClockToUtc } from "../../src/utils/time-zone.js";

const at = (iso: string) => new Date(iso);

function provider(overrides: Partial<ProviderSchedule> = {}): ProviderSchedule {
  return {
    staffId: "staff-a",
    durationMinutes: 60,
    weeklyRules: [],
    timeOff: [],
    busy: [],
    classSessions: [],
    ...overrides,
  };
}

function input(overrides: Partial<SlotGeneratorInput> = {}): SlotGeneratorInput {
  return {
    from: at("2026-06-01T00:00:00Z"),
    to: at("2026-06-02T00:00:00Z"),
    now: at("2026-05-01T00:00:00Z"),
    closedDates: new Set(),
    service: { bookingType: "APPOINTMENT", capacity: 1, bufferBeforeMin: 0, bufferAfterMin: 0 },
    policy: { slotStepMinutes: 60, minimumNoticeMinutes: 0, bookingWindowDays: 365 },
    providers: [],
    resources: [],
    ...overrides,
  };
}

const startsOf = (slots: ReturnType<typeof generateSlots>) =>
  slots.map((slot) => slot.startsAt.toISOString());

// 2026-06-01 is a Monday.
const mondayNineToTwelveUtc = [{ weekday: 1, startMinute: 540, endMinute: 720, timeZone: "UTC" }];

describe("wallClockToUtc", () => {
  it.each([
    ["2026-01-15", 540, "Europe/London", "2026-01-15T09:00:00.000Z"],
    ["2026-07-15", 540, "Europe/London", "2026-07-15T08:00:00.000Z"],
    ["2026-03-29", 90, "Europe/London", "2026-03-29T01:30:00.000Z"],
    ["2026-10-25", 90, "Europe/London", "2026-10-25T00:30:00.000Z"],
    ["2026-06-01", 1500, "Asia/Karachi", "2026-06-01T20:00:00.000Z"],
    ["2026-03-08", 150, "America/New_York", "2026-03-08T07:30:00.000Z"],
  ])("maps %s + %i min in %s", (date, minute, timeZone, expected) => {
    expect(wallClockToUtc(date, minute, timeZone).toISOString()).toBe(expected);
  });

  it("resolves an ambiguous autumn time to its first occurrence", () => {
    // 01:30 happens twice in New York on 2026-11-01; the first is EDT.
    expect(wallClockToUtc("2026-11-01", 90, "America/New_York").toISOString()).toBe(
      "2026-11-01T05:30:00.000Z",
    );
  });

  it("reports offsets on both sides of a DST change", () => {
    expect(getTimeZoneOffsetMinutes(at("2026-03-29T00:59:00Z"), "Europe/London")).toBe(0);
    expect(getTimeZoneOffsetMinutes(at("2026-03-29T01:00:00Z"), "Europe/London")).toBe(60);
  });
});

describe("generateSlots", () => {
  it("walks a simple shift in policy steps", () => {
    const slots = generateSlots(input({ providers: [provider({ weeklyRules: mondayNineToTwelveUtc })] }));

    expect(startsOf(slots)).toEqual([
      "2026-06-01T09:00:00.000Z",
      "2026-06-01T10:00:00.000Z",
      "2026-06-01T11:00:00.000Z",
    ]);
    expect(slots[0]).toMatchObject({ staffIds: ["staff-a"], seatsLeft: null });
  });

  it.each([
    [
      "a spring-forward day keeps wall-clock hours (London 09:00 BST = 08:00Z)",
      "2026-03-29",
      ["2026-03-29T08:00:00.000Z", "2026-03-29T09:00:00.000Z", "2026-03-29T10:00:00.000Z"],
    ],
    [
      "an autumn-back day keeps wall-clock hours (London 09:00 GMT = 09:00Z)",
      "2026-10-25",
      ["2026-10-25T09:00:00.000Z", "2026-10-25T10:00:00.000Z", "2026-10-25T11:00:00.000Z"],
    ],
  ])("%s", (_label, date, expected) => {
    const slots = generateSlots(
      input({
        from: at(`${date}T00:00:00Z`),
        to: at(`${date}T23:59:00Z`),
        now: at("2026-01-01T00:00:00Z"),
        providers: [
          provider({
            weeklyRules: [{ weekday: 7, startMinute: 540, endMinute: 720, timeZone: "Europe/London" }],
          }),
        ],
      }),
    );

    expect(startsOf(slots)).toEqual(expected);
  });

  it("spans the lost hour inside a night shift on the spring-forward date", () => {
    // Saturday 22:00 to Sunday 04:00 London time, the night the clocks jump 01:00 → 02:00.
    const slots = generateSlots(
      input({
        from: at("2026-03-28T00:00:00Z"),
        to: at("2026-03-30T00:00:00Z"),
        now: at("2026-01-01T00:00:00Z"),
        providers: [
          provider({
            weeklyRules: [{ weekday: 6, startMinute: 1320, endMinute: 1680, timeZone: "Europe/London" }],
          }),
        ],
      }),
    );

    // Six wall-clock hours but only five real hours.
    expect(startsOf(slots)).toEqual([
      "2026-03-28T22:00:00.000Z",
      "2026-03-28T23:00:00.000Z",
      "2026-03-29T00:00:00.000Z",
      "2026-03-29T01:00:00.000Z",
      "2026-03-29T02:00:00.000Z",
    ]);
  });

  it("includes an overnight shift that started the previous day", () => {
    const slots = generateSlots(
      input({
        from: at("2026-06-02T00:00:00Z"),
        to: at("2026-06-02T12:00:00Z"),
        providers: [
          provider({ weeklyRules: [{ weekday: 1, startMinute: 1320, endMinute: 1560, timeZone: "UTC" }] }),
        ],
      }),
    );

    expect(startsOf(slots)).toEqual(["2026-06-02T00:00:00.000Z", "2026-06-02T01:00:00.000Z"]);
  });

  it("merges split shifts that touch so a slot can cross the seam", () => {
    const slots = generateSlots(
      input({
        policy: { slotStepMinutes: 30, minimumNoticeMinutes: 0, bookingWindowDays: 365 },
        providers: [
          provider({
            weeklyRules: [
              { weekday: 1, startMinute: 540, endMinute: 600, timeZone: "UTC" },
              { weekday: 1, startMinute: 600, endMinute: 660, timeZone: "UTC" },
            ],
          }),
        ],
      }),
    );

    expect(startsOf(slots)).toContain("2026-06-01T09:30:00.000Z");
  });

  it("treats a gap between shifts as a break", () => {
    const slots = generateSlots(
      input({
        providers: [
          provider({
            weeklyRules: [
              { weekday: 1, startMinute: 540, endMinute: 660, timeZone: "UTC" },
              { weekday: 1, startMinute: 720, endMinute: 840, timeZone: "UTC" },
            ],
          }),
        ],
      }),
    );

    expect(startsOf(slots)).toEqual([
      "2026-06-01T09:00:00.000Z",
      "2026-06-01T10:00:00.000Z",
      "2026-06-01T12:00:00.000Z",
      "2026-06-01T13:00:00.000Z",
    ]);
  });

  it.each([
    [
      "no buffers let bookings touch",
      0,
      0,
      ["2026-06-01T10:00:00.000Z", "2026-06-01T11:00:00.000Z", "2026-06-01T12:00:00.000Z"],
    ],
    [
      "a buffer after must still fit before the shift ends",
      0,
      15,
      ["2026-06-01T10:00:00.000Z", "2026-06-01T11:00:00.000Z"],
    ],
    [
      "a buffer before cannot overlap the previous booking",
      15,
      0,
      ["2026-06-01T11:00:00.000Z", "2026-06-01T12:00:00.000Z"],
    ],
  ])("%s", (_label, bufferBeforeMin, bufferAfterMin, expected) => {
    const slots = generateSlots(
      input({
        service: { bookingType: "APPOINTMENT", capacity: 1, bufferBeforeMin, bufferAfterMin },
        providers: [
          provider({
            weeklyRules: [{ weekday: 1, startMinute: 540, endMinute: 780, timeZone: "UTC" }],
            busy: [{ startsAt: at("2026-06-01T09:00:00Z"), endsAt: at("2026-06-01T10:00:00Z") }],
          }),
        ],
      }),
    );

    expect(startsOf(slots)).toEqual(expected);
  });

  it("keeps slots on the shift grid after a busy gap", () => {
    const slots = generateSlots(
      input({
        policy: { slotStepMinutes: 15, minimumNoticeMinutes: 0, bookingWindowDays: 365 },
        providers: [
          provider({
            durationMinutes: 30,
            weeklyRules: mondayNineToTwelveUtc,
            busy: [{ startsAt: at("2026-06-01T09:00:00Z"), endsAt: at("2026-06-01T10:40:00Z") }],
          }),
        ],
      }),
    );

    expect(startsOf(slots)[0]).toBe("2026-06-01T10:45:00.000Z");
  });

  it("removes time off and closed dates", () => {
    const withTimeOff = generateSlots(
      input({
        providers: [
          provider({
            weeklyRules: mondayNineToTwelveUtc,
            timeOff: [{ startsAt: at("2026-06-01T10:00:00Z"), endsAt: at("2026-06-01T11:00:00Z") }],
          }),
        ],
      }),
    );

    expect(startsOf(withTimeOff)).toEqual(["2026-06-01T09:00:00.000Z", "2026-06-01T11:00:00.000Z"]);

    const closed = generateSlots(
      input({
        closedDates: new Set(["2026-06-01"]),
        providers: [provider({ weeklyRules: mondayNineToTwelveUtc })],
      }),
    );

    expect(closed).toEqual([]);
  });

  it("applies minimum notice and the booking window", () => {
    const slots = generateSlots(
      input({
        now: at("2026-06-01T08:30:00Z"),
        policy: { slotStepMinutes: 60, minimumNoticeMinutes: 60, bookingWindowDays: 365 },
        providers: [provider({ weeklyRules: mondayNineToTwelveUtc })],
      }),
    );

    expect(startsOf(slots)).toEqual(["2026-06-01T10:00:00.000Z", "2026-06-01T11:00:00.000Z"]);

    const outsideWindow = generateSlots(
      input({
        now: at("2026-05-01T00:00:00Z"),
        policy: { slotStepMinutes: 60, minimumNoticeMinutes: 0, bookingWindowDays: 7 },
        providers: [provider({ weeklyRules: mondayNineToTwelveUtc })],
      }),
    );

    expect(outsideWindow).toEqual([]);
  });

  it("unions providers and remembers who owns each slot", () => {
    const slots = generateSlots(
      input({
        providers: [
          provider({ staffId: "staff-a", weeklyRules: mondayNineToTwelveUtc }),
          provider({
            staffId: "staff-b",
            weeklyRules: [{ weekday: 1, startMinute: 600, endMinute: 780, timeZone: "UTC" }],
          }),
        ],
      }),
    );

    expect(slots.map((slot) => [slot.startsAt.toISOString().slice(11, 16), slot.staffIds])).toEqual([
      ["09:00", ["staff-a"]],
      ["10:00", ["staff-a", "staff-b"]],
      ["11:00", ["staff-a", "staff-b"]],
      ["12:00", ["staff-b"]],
    ]);
  });

  it("offers seats in an existing class session and blocks overlapping starts", () => {
    const session = {
      startsAt: at("2026-06-01T10:00:00Z"),
      endsAt: at("2026-06-01T11:00:00Z"),
      blocked: { startsAt: at("2026-06-01T10:00:00Z"), endsAt: at("2026-06-01T11:00:00Z") },
      seatsTaken: 9,
    };
    const slots = generateSlots(
      input({
        service: { bookingType: "CLASS", capacity: 10, bufferBeforeMin: 0, bufferAfterMin: 0 },
        policy: { slotStepMinutes: 30, minimumNoticeMinutes: 0, bookingWindowDays: 365 },
        providers: [provider({ weeklyRules: mondayNineToTwelveUtc, classSessions: [session] })],
      }),
    );

    expect(slots.map((slot) => [slot.startsAt.toISOString().slice(11, 16), slot.seatsLeft])).toEqual([
      ["09:00", 10],
      ["10:00", 1],
      ["11:00", 10],
    ]);

    const full = generateSlots(
      input({
        service: { bookingType: "CLASS", capacity: 10, bufferBeforeMin: 0, bufferAfterMin: 0 },
        providers: [
          provider({ weeklyRules: mondayNineToTwelveUtc, classSessions: [{ ...session, seatsTaken: 10 }] }),
        ],
      }),
    );

    expect(startsOf(full)).not.toContain("2026-06-01T10:00:00.000Z");
  });

  it("requires every needed resource to have room", () => {
    const slots = generateSlots(
      input({
        providers: [
          provider({ staffId: "staff-a", weeklyRules: mondayNineToTwelveUtc }),
          provider({ staffId: "staff-b", weeklyRules: mondayNineToTwelveUtc }),
        ],
        resources: [
          {
            resourceId: "room-1",
            capacity: 1,
            busy: [{ startsAt: at("2026-06-01T10:00:00Z"), endsAt: at("2026-06-01T11:00:00Z") }],
          },
        ],
      }),
    );

    expect(startsOf(slots)).toEqual(["2026-06-01T09:00:00.000Z", "2026-06-01T11:00:00.000Z"]);
  });
});

describe("interval helpers", () => {
  it("subtracts blocked ranges and keeps anchors", () => {
    expect(
      subtractIntervals(
        [{ start: 0, end: 100, anchor: 0 }],
        [
          { start: 10, end: 20 },
          { start: 15, end: 30 },
          { start: 90, end: 120 },
        ],
      ),
    ).toEqual([
      { start: 0, end: 10, anchor: 0 },
      { start: 30, end: 90, anchor: 0 },
    ]);
  });

  it("counts peak overlap without stacking touching intervals", () => {
    const intervals = [
      { start: 0, end: 10 },
      { start: 10, end: 20 },
      { start: 5, end: 15 },
    ];

    expect(maxConcurrency(intervals, { start: 0, end: 20 })).toBe(2);
    expect(maxConcurrency(intervals, { start: 16, end: 20 })).toBe(1);
  });
});
