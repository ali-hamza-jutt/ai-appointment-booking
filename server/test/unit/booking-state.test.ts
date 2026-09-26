import { describe, expect, it } from "vitest";

import {
  BOOKING_TRANSITIONS,
  canTransition,
  nextStatus,
} from "../../src/modules/bookings/booking-state.js";
import type { BookingStatus } from "../../src/modules/bookings/dto/booking.dto.js";

describe("booking state machine", () => {
  it.each([
    ["HELD", "CONFIRM", "CONFIRMED"],
    ["HELD", "REQUEST_APPROVAL", "PENDING"],
    ["HELD", "REQUIRE_PAYMENT", "PENDING_PAYMENT"],
    ["PENDING_PAYMENT", "CONFIRM", "CONFIRMED"],
    ["HELD", "EXPIRE", "EXPIRED"],
    ["PENDING_PAYMENT", "EXPIRE", "EXPIRED"],
    ["PENDING", "APPROVE", "CONFIRMED"],
    ["PENDING", "DECLINE", "CANCELLED"],
    ["CONFIRMED", "CHECK_IN", "CHECKED_IN"],
    ["CHECKED_IN", "COMPLETE", "COMPLETED"],
    ["CONFIRMED", "MARK_NO_SHOW", "NO_SHOW"],
    ["CONFIRMED", "CANCEL", "CANCELLED"],
    ["CONFIRMED", "RESCHEDULE", "CONFIRMED"],
    ["PENDING", "RESCHEDULE", "PENDING"],
  ] as const)("%s --%s--> %s", (from, event, to) => {
    expect(canTransition(from, event)).toBe(true);
    expect(nextStatus(from, event)).toBe(to);
  });

  it.each([
    ["CONFIRMED", "COMPLETE"],
    ["EXPIRED", "CONFIRM"],
    ["CANCELLED", "CANCEL"],
    ["COMPLETED", "CANCEL"],
    ["NO_SHOW", "CHECK_IN"],
    ["CHECKED_IN", "RESCHEDULE"],
    ["HELD", "CHECK_IN"],
  ] as const)("rejects %s --%s-->", (from, event) => {
    expect(canTransition(from, event)).toBe(false);
  });

  it("never leaves a terminal status", () => {
    const terminal: BookingStatus[] = ["COMPLETED", "CANCELLED", "NO_SHOW", "EXPIRED"];

    for (const transition of Object.values(BOOKING_TRANSITIONS)) {
      expect(transition.from.some((status) => terminal.includes(status))).toBe(false);
    }
  });
});
