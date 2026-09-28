import { describe, expect, it } from "vitest";

import type { ChatMessagePart } from "../../src/modules/chat/dto/chat.dto.js";
import { interpretReply, numberedOptions, renderReply } from "../../src/modules/messaging/channel-renderer.js";
import { messageIdFor } from "../../src/modules/messaging/messaging.service.js";

const slots: ChatMessagePart = {
  type: "slot_picker",
  serviceId: "svc",
  serviceName: "Haircut",
  timeZone: "UTC",
  slots: [
    { token: "t1", startsAt: "2026-10-06T10:00:00.000Z", endsAt: "2026-10-06T10:30:00.000Z", staffName: "Sana", seatsLeft: null },
    { token: "t2", startsAt: "2026-10-06T11:00:00.000Z", endsAt: "2026-10-06T11:30:00.000Z", staffName: null, seatsLeft: null },
  ],
};

const confirm: ChatMessagePart = {
  type: "confirm",
  label: "Confirm booking",
  description: "Book this time.",
  tone: "primary",
  action: { type: "confirm_booking" },
};

describe("channel renderer", () => {
  it("writes offered times as numbered options and reads a number back as that time", () => {
    const text = renderReply("Here are some times.", [slots], "SMS");

    expect(text).toBe(
      "Here are some times.\n\n1. Tue, Oct 6, 10:00 AM with Sana\n2. Tue, Oct 6, 11:00 AM\n\nReply with a number.",
    );
    expect(interpretReply(" 2 ", [slots])).toEqual({ type: "select_slot", slotToken: "t2" });
    expect(interpretReply("3", [slots])).toBeNull();
    expect(interpretReply("yes", [slots])).toBeNull();
  });

  it("moves a booking when the times were offered for rescheduling", () => {
    expect(interpretReply("1", [{ ...slots, rescheduleBookingId: "b1" } as ChatMessagePart])).toEqual({
      type: "reschedule_booking",
      bookingId: "b1",
      slotToken: "t1",
    });
  });

  it("turns a single button into Reply YES, and several into numbered options", () => {
    expect(renderReply("It's held for you.", [confirm], "WHATSAPP")).toBe(
      "It's held for you.\n\nReply YES to confirm booking.",
    );
    expect(interpretReply("Yes!", [confirm])).toEqual({ type: "confirm_booking" });
    expect(interpretReply("yes please, but later", [confirm])).toBeNull();

    const cancelOne: ChatMessagePart = { ...confirm, label: "Cancel haircut", action: { type: "cancel_booking", bookingId: "b1" } };
    const cancelTwo: ChatMessagePart = { ...confirm, label: "Cancel massage", action: { type: "cancel_booking", bookingId: "b2" } };

    expect(numberedOptions([cancelOne, cancelTwo]).map((option) => option.label)).toEqual(["Cancel haircut", "Cancel massage"]);
    expect(interpretReply("2", [cancelOne, cancelTwo])).toEqual({ type: "cancel_booking", bookingId: "b2" });
    expect(interpretReply("yes", [cancelOne, cancelTwo])).toBeNull();
  });

  it("lists services with their length and price", () => {
    const cards: ChatMessagePart = {
      type: "service_cards",
      services: [{ id: "s1", name: "Haircut", description: null, durationMinutes: 30, priceMinor: 2_500, currency: "USD" }],
    };

    expect(renderReply("What would you like?", [cards], "SMS")).toContain("1. Haircut (30 min, $25.00)");
    expect(interpretReply("1", [cards])).toEqual({ type: "select_service", serviceId: "s1" });
  });

  it("keeps SMS replies within a few segments", () => {
    expect(renderReply("x".repeat(3_000), [], "SMS")).toHaveLength(1_500);
    expect(renderReply("x".repeat(3_000), [], "WHATSAPP")).toHaveLength(3_000);
  });

  it("gives each Twilio message a stable UUID", () => {
    expect(messageIdFor("SM123")).toBe(messageIdFor("SM123"));
    expect(messageIdFor("SM123")).not.toBe(messageIdFor("SM124"));
    expect(messageIdFor("SM123")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
