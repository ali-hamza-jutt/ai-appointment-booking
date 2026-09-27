import { describe, expect, it } from "vitest";

import { buildCalendarInvite, type CalendarInviteInput } from "../../src/utils/ics.js";

const invite: CalendarInviteInput = {
  uid: "0c1b2a3d@bookwise.app",
  sequence: 0,
  method: "REQUEST",
  start: new Date("2026-10-06T10:00:00Z"),
  end: new Date("2026-10-06T11:00:00Z"),
  summary: "Haircut at Glow Salon",
  description: "Haircut with Sana; bring your card, please",
  location: "Main studio, 12 High Street",
  organizer: { name: "Glow Salon", email: "no-reply@bookwise.local" },
  attendee: { name: "Ayesha Khan", email: "ayesha@example.com" },
  now: new Date("2026-10-01T09:30:15Z"),
};

describe("buildCalendarInvite", () => {
  it("writes an RFC 5545 request with CRLF lines and UTC times", () => {
    const text = buildCalendarInvite(invite);

    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text.split("\r\n")).toEqual(
      expect.arrayContaining([
        "METHOD:REQUEST",
        "UID:0c1b2a3d@bookwise.app",
        "SEQUENCE:0",
        "DTSTAMP:20261001T093015Z",
        "DTSTART:20261006T100000Z",
        "DTEND:20261006T110000Z",
        "SUMMARY:Haircut at Glow Salon",
        "DESCRIPTION:Haircut with Sana\\; bring your card\\, please",
        "LOCATION:Main studio\\, 12 High Street",
        "ORGANIZER;CN=Glow Salon:mailto:no-reply@bookwise.local",
        "STATUS:CONFIRMED",
      ]),
    );
  });

  it("marks a cancellation", () => {
    const lines = buildCalendarInvite({ ...invite, method: "CANCEL", sequence: 2 }).split("\r\n");

    expect(lines).toEqual(expect.arrayContaining(["METHOD:CANCEL", "SEQUENCE:2", "STATUS:CANCELLED"]));
  });

  it("folds long lines at 75 octets without splitting a character", () => {
    const text = buildCalendarInvite({ ...invite, description: `Café visit — ${"é".repeat(80)}` });
    const lines = text.split("\r\n");

    expect(lines.every((line) => Buffer.byteLength(line, "utf8") <= 75)).toBe(true);
    expect(text).not.toContain("�");
    // Unfolding restores the original line.
    expect(text.replace(/\r\n /g, "")).toContain(`DESCRIPTION:Café visit — ${"é".repeat(80)}`);
  });

  it("quotes names that contain separators", () => {
    expect(buildCalendarInvite({ ...invite, organizer: { name: "Glow; Spa", email: "a@b.c" } })).toContain(
      'ORGANIZER;CN="Glow; Spa":mailto:a@b.c',
    );
  });
});
