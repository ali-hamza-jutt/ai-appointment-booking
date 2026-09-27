import { NOTIFICATION_CONSTANTS } from "../constants/app.constants.js";

export interface CalendarInviteInput {
  /** Stable across updates, so calendars replace the event instead of adding another. */
  uid: string;
  /** Must grow with every update to the same uid. */
  sequence: number;
  method: "REQUEST" | "CANCEL";
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string | null;
  organizer: { name: string; email: string };
  attendee?: { name: string; email: string };
  now: Date;
}

/** 20261006T100000Z */
function formatUtc(value: Date): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** TEXT values escape backslashes, semicolons, commas and newlines. */
function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Parameter values containing : ; or , must be quoted, and may not contain quotes. */
function quoteParameter(value: string): string {
  const clean = value.replace(/"/g, "'");

  return /[:;,]/.test(clean) ? `"${clean}"` : clean;
}

/** Lines longer than 75 octets continue on the next line after a space, never mid-character. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const character of line) {
    const bytes = Buffer.byteLength(character, "utf8");
    const limit = parts.length === 0 ? 75 : 74;

    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }

    current += character;
    currentBytes += bytes;
  }

  parts.push(current);

  return parts.join("\r\n ");
}

/** An RFC 5545 calendar with one event, as sent with booking emails. */
export function buildCalendarInvite(input: CalendarInviteInput): string {
  const cancelled = input.method === "CANCEL";
  const lines = [
    "BEGIN:VCALENDAR",
    `PRODID:${NOTIFICATION_CONSTANTS.ICS_PRODUCT_ID}`,
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${input.method}`,
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTAMP:${formatUtc(input.now)}`,
    `DTSTART:${formatUtc(input.start)}`,
    `DTEND:${formatUtc(input.end)}`,
    `SUMMARY:${escapeText(input.summary)}`,
    ...(input.description ? [`DESCRIPTION:${escapeText(input.description)}`] : []),
    ...(input.location ? [`LOCATION:${escapeText(input.location)}`] : []),
    `ORGANIZER;CN=${quoteParameter(input.organizer.name)}:mailto:${input.organizer.email}`,
    ...(input.attendee
      ? [
          `ATTENDEE;CN=${quoteParameter(input.attendee.name)};ROLE=REQ-PARTICIPANT;RSVP=FALSE:mailto:${input.attendee.email}`,
        ]
      : []),
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.map(fold).join("\r\n")}\r\n`;
}
