import { afterEach, describe, expect, it, vi } from "vitest";

import { CalendarApiError } from "../../src/integrations/calendar/calendar-http.js";
import { GoogleCalendarClient, googleEventId } from "../../src/integrations/calendar/google-calendar.client.js";
import { MicrosoftCalendarClient, parseGraphUtc } from "../../src/integrations/calendar/microsoft-calendar.client.js";

interface Call {
  url: string;
  method: string;
  body: unknown;
}

/** Answers fetch calls in order and records what was asked. */
function stubFetch(...responses: Array<{ status?: number; body?: unknown }>): Call[] {
  const calls: Call[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      const text = typeof init.body === "string" ? init.body : "";
      const isForm = String((init.headers as Record<string, string>)["Content-Type"] ?? "").includes("form");

      calls.push({
        url,
        method: init.method ?? "GET",
        body: text ? (isForm ? Object.fromEntries(new URLSearchParams(text)) : JSON.parse(text)) : null,
      });

      const next = responses.shift() ?? { status: 200, body: {} };

      return Promise.resolve(
        new Response(next.body === undefined ? "" : JSON.stringify(next.body), { status: next.status ?? 200 }),
      );
    }),
  );

  return calls;
}

const range = { from: new Date("2026-10-06T00:00:00Z"), to: new Date("2026-10-08T00:00:00Z") };
const BOOKING = "0c1b2a3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

afterEach(() => vi.unstubAllGlobals());

describe("Google calendar client", () => {
  const client = new GoogleCalendarClient("client-id", "client-secret");

  it("asks for offline access with PKCE", () => {
    const url = new URL(client.authorizationUrl({ state: "s", codeChallenge: "c", redirectUri: "https://api/cb" }));

    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "client-id",
      access_type: "offline",
      prompt: "consent",
      state: "s",
      code_challenge: "c",
      code_challenge_method: "S256",
      redirect_uri: "https://api/cb",
    });
    expect(url.searchParams.get("scope")).toContain("calendar.events");
  });

  it("reads busy times, skipping free, cancelled, declined and BookWise events", async () => {
    const calls = stubFetch(
      {
        body: {
          timeZone: "Europe/London",
          nextPageToken: "page-2",
          items: [
            { id: "a", start: { dateTime: "2026-10-06T10:00:00Z" }, end: { dateTime: "2026-10-06T11:00:00Z" } },
            { id: "b", transparency: "transparent", start: { dateTime: "2026-10-06T12:00:00Z" }, end: { dateTime: "2026-10-06T13:00:00Z" } },
            { id: "c", status: "cancelled" },
            {
              id: "d",
              attendees: [{ self: true, responseStatus: "declined" }],
              start: { dateTime: "2026-10-06T14:00:00Z" },
              end: { dateTime: "2026-10-06T15:00:00Z" },
            },
            {
              id: "e",
              extendedProperties: { private: { bookwiseBookingId: BOOKING } },
              start: { dateTime: "2026-10-06T15:00:00Z" },
              end: { dateTime: "2026-10-06T16:00:00Z" },
            },
          ],
        },
      },
      {
        body: {
          timeZone: "Europe/London",
          items: [
            { id: "f", start: { date: "2026-10-07" }, end: { date: "2026-10-08" } },
            { id: "g", start: { dateTime: "2026-10-06T16:00:00Z" }, end: { dateTime: "2026-10-06T17:00:00Z" } },
          ],
        },
      },
    );

    await expect(client.listBusy("token", range, new Set(["g"]))).resolves.toEqual([
      { startsAt: new Date("2026-10-06T10:00:00Z"), endsAt: new Date("2026-10-06T11:00:00Z") },
      // An all-day event in London (UTC+1 in October) runs 23:00 to 23:00 UTC.
      { startsAt: new Date("2026-10-06T23:00:00Z"), endsAt: new Date("2026-10-07T23:00:00Z") },
    ]);
    expect(calls).toHaveLength(2);
    expect(new URL(calls[0]?.url ?? "").searchParams.get("singleEvents")).toBe("true");
    expect(new URL(calls[1]?.url ?? "").searchParams.get("pageToken")).toBe("page-2");
  });

  it("creates a booking's event under an id derived from the booking when it isn't there yet", async () => {
    const calls = stubFetch({ status: 404, body: { error: { message: "Not Found" } } }, { body: { id: googleEventId(BOOKING) } });
    const id = await client.upsertEvent(
      "token",
      {
        bookingId: BOOKING,
        summary: "Haircut · Ayesha",
        description: "Ayesha",
        location: null,
        startsAt: new Date("2026-10-06T10:00:00Z"),
        endsAt: new Date("2026-10-06T11:00:00Z"),
      },
      null,
    );

    expect(id).toBe("bw0c1b2a3d4e5f4a6b8c7d9e0f1a2b3c4d");
    expect(calls.map((call) => call.method)).toEqual(["PATCH", "POST"]);
    expect(calls[1]?.body).toMatchObject({
      id,
      start: { dateTime: "2026-10-06T10:00:00.000Z" },
      transparency: "opaque",
      extendedProperties: { private: { bookwiseBookingId: BOOKING } },
    });
  });

  it("reports a revoked grant as needing a reconnect", async () => {
    stubFetch({ status: 400, body: { error: "invalid_grant", error_description: "Token has been expired or revoked." } });

    const error = await client.refreshAccessToken("refresh").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CalendarApiError);
    expect(error).toMatchObject({ kind: "auth", status: 400 });
  });

  it("treats rate limits and server errors as temporary", async () => {
    stubFetch({ status: 503, body: {} });

    await expect(client.deleteEvent("token", "x")).rejects.toMatchObject({ kind: "transient" });
  });
});

describe("Microsoft calendar client", () => {
  const client = new MicrosoftCalendarClient("client-id", "client-secret", "common");

  it("reads Graph's UTC times", () => {
    expect(parseGraphUtc("2026-10-06T10:00:00.0000000")).toEqual(new Date("2026-10-06T10:00:00Z"));
    expect(parseGraphUtc("2026-10-06T10:00:00")).toEqual(new Date("2026-10-06T10:00:00Z"));
    expect(parseGraphUtc(undefined)).toBeNull();
  });

  it("reads busy times, skipping free, cancelled, declined and BookWise events", async () => {
    const calls = stubFetch(
      {
        body: {
          value: [
            { id: "a", showAs: "busy", start: { dateTime: "2026-10-06T10:00:00.0000000" }, end: { dateTime: "2026-10-06T11:00:00.0000000" } },
            { id: "b", showAs: "free", start: { dateTime: "2026-10-06T12:00:00" }, end: { dateTime: "2026-10-06T13:00:00" } },
            { id: "c", isCancelled: true, showAs: "busy" },
            {
              id: "d",
              showAs: "tentative",
              responseStatus: { response: "declined" },
              start: { dateTime: "2026-10-06T14:00:00" },
              end: { dateTime: "2026-10-06T15:00:00" },
            },
            { id: "own", showAs: "busy", start: { dateTime: "2026-10-06T15:00:00" }, end: { dateTime: "2026-10-06T16:00:00" } },
          ],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/calendarView?$skip=5",
        },
      },
      {
        body: {
          value: [{ id: "e", showAs: "oof", start: { dateTime: "2026-10-07T09:00:00" }, end: { dateTime: "2026-10-07T17:00:00" } }],
        },
      },
    );

    await expect(client.listBusy("token", range, new Set(["own"]))).resolves.toEqual([
      { startsAt: new Date("2026-10-06T10:00:00Z"), endsAt: new Date("2026-10-06T11:00:00Z") },
      { startsAt: new Date("2026-10-07T09:00:00Z"), endsAt: new Date("2026-10-07T17:00:00Z") },
    ]);
    expect(calls[1]?.url).toBe("https://graph.microsoft.com/v1.0/me/calendarView?$skip=5");
  });

  it("creates an event with the booking as transaction id so a retried create isn't doubled", async () => {
    const calls = stubFetch({ body: { id: "AAMk-event" } });
    const id = await client.upsertEvent(
      "token",
      {
        bookingId: BOOKING,
        summary: "Haircut · Ayesha",
        description: "Ayesha",
        location: "Main studio",
        startsAt: new Date("2026-10-06T10:00:00Z"),
        endsAt: new Date("2026-10-06T11:00:00Z"),
      },
      null,
    );

    expect(id).toBe("AAMk-event");
    expect(calls[0]?.body).toMatchObject({
      transactionId: BOOKING,
      start: { dateTime: "2026-10-06T10:00:00.000", timeZone: "UTC" },
      location: { displayName: "Main studio" },
      showAs: "busy",
    });
  });

  it("extends a subscription in place, and replaces one that expired", async () => {
    const current = { channelId: "sub-1", resourceId: null, expiresAt: new Date("2026-10-06T00:00:00Z") };
    const request = { address: "https://api/hook", token: "secret", expiresAt: new Date("2026-10-09T00:00:00Z") };

    stubFetch({ body: { id: "sub-1", expirationDateTime: "2026-10-09T00:00:00Z" } });
    await expect(client.renewWatch("token", current, request)).resolves.toMatchObject({
      usesNewToken: false,
      watch: { channelId: "sub-1" },
    });

    stubFetch({ status: 404, body: {} }, { body: { id: "sub-2", expirationDateTime: "2026-10-09T00:00:00Z" } });
    await expect(client.renewWatch("token", current, request)).resolves.toMatchObject({
      usesNewToken: true,
      watch: { channelId: "sub-2" },
    });
  });
});
