import { randomUUID } from "node:crypto";

import { AUTH_CONSTANTS, CALENDAR_CONSTANTS } from "../../constants/app.constants.js";
import { localDateTimeToUtc } from "../../utils/time-zone.js";
import { CalendarApiError, calendarRequest, decodeJwtPayload } from "./calendar-http.js";
import type {
  BusyInterval,
  CalendarEventInput,
  CalendarGrant,
  CalendarProviderClient,
  CalendarTokens,
  CalendarWatch,
  RenewedWatch,
  WatchRequest,
} from "./calendar.dto.js";

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
}

interface GoogleEventTime {
  dateTime?: string;
  date?: string;
}

interface GoogleEvent {
  id: string;
  status?: string;
  transparency?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  attendees?: Array<{ self?: boolean; responseStatus?: string }>;
  extendedProperties?: { private?: Record<string, string> };
}

interface GoogleEventList {
  items?: GoogleEvent[];
  nextPageToken?: string;
  timeZone?: string;
}

const EVENTS_URL = `${CALENDAR_CONSTANTS.GOOGLE_API_URL}/calendars/primary/events`;

/**
 * Google lets clients choose event ids (base32hex, 5–1024 characters), so a
 * booking's event id is derived from the booking: a retried create finds the
 * event instead of adding a second one.
 */
export function googleEventId(bookingId: string): string {
  return `bw${bookingId.replace(/-/g, "").toLowerCase()}`;
}

function toTokens(response: GoogleTokenResponse, now: Date): CalendarTokens {
  return {
    accessToken: response.access_token,
    expiresAt: new Date(now.getTime() + response.expires_in * 1_000),
    ...(response.refresh_token ? { refreshToken: response.refresh_token } : {}),
  };
}

/** Start or end of an event; all-day events use the calendar's time zone. */
function toInstant(time: GoogleEventTime | undefined, timeZone: string): Date | null {
  if (time?.dateTime) {
    const instant = new Date(time.dateTime);

    return Number.isNaN(instant.getTime()) ? null : instant;
  }

  return time?.date ? localDateTimeToUtc(time.date, "00:00", timeZone) : null;
}

export class GoogleCalendarClient implements CalendarProviderClient {
  public readonly provider = "GOOGLE" as const;

  public constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  public authorizationUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string {
    const url = new URL(AUTH_CONSTANTS.GOOGLE_AUTHORIZE_URL);

    url.search = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: input.redirectUri,
      response_type: "code",
      scope: CALENDAR_CONSTANTS.GOOGLE_SCOPES,
      // Offline access and a forced consent screen are what make Google return a refresh token.
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256",
    }).toString();

    return url.toString();
  }

  public async exchangeCode(input: { code: string; codeVerifier: string; redirectUri: string }): Promise<CalendarGrant> {
    const now = new Date();
    const { data } = await calendarRequest<GoogleTokenResponse>("GOOGLE", AUTH_CONSTANTS.GOOGLE_TOKEN_URL, {
      form: {
        code: input.code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: input.redirectUri,
        grant_type: "authorization_code",
        code_verifier: input.codeVerifier,
      },
    });

    if (!data?.access_token || !data.refresh_token) {
      throw new CalendarApiError("Google did not return a refresh token", "rejected");
    }

    const email = data.id_token ? decodeJwtPayload(data.id_token).email : undefined;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: toTokens(data, now).expiresAt,
      accountEmail: typeof email === "string" ? email : "Google account",
    };
  }

  public async refreshAccessToken(refreshToken: string): Promise<CalendarTokens> {
    const now = new Date();
    const { data } = await calendarRequest<GoogleTokenResponse>("GOOGLE", AUTH_CONSTANTS.GOOGLE_TOKEN_URL, {
      form: {
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: "refresh_token",
      },
    });

    if (!data?.access_token) throw new CalendarApiError("Google returned no access token", "transient");

    return toTokens(data, now);
  }

  public async listBusy(
    accessToken: string,
    range: { from: Date; to: Date },
    ownEventIds: ReadonlySet<string>,
  ): Promise<BusyInterval[]> {
    const busy: BusyInterval[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < CALENDAR_CONSTANTS.MAX_PAGES; page += 1) {
      const url = new URL(EVENTS_URL);

      url.search = new URLSearchParams({
        timeMin: range.from.toISOString(),
        timeMax: range.to.toISOString(),
        singleEvents: "true",
        showDeleted: "false",
        maxResults: "2500",
        fields:
          "timeZone,nextPageToken,items(id,status,transparency,start,end,attendees(self,responseStatus),extendedProperties/private)",
        ...(pageToken ? { pageToken } : {}),
      }).toString();

      const { data } = await calendarRequest<GoogleEventList>("GOOGLE", url.toString(), { accessToken });
      const timeZone = data?.timeZone ?? "UTC";

      for (const event of data?.items ?? []) {
        const declined = event.attendees?.some((attendee) => attendee.self && attendee.responseStatus === "declined");

        if (
          event.status === "cancelled" ||
          event.transparency === "transparent" ||
          declined ||
          event.extendedProperties?.private?.[CALENDAR_CONSTANTS.EVENT_PROPERTY] ||
          ownEventIds.has(event.id)
        ) {
          continue;
        }

        const startsAt = toInstant(event.start, timeZone);
        const endsAt = toInstant(event.end, timeZone);

        if (startsAt && endsAt && endsAt > startsAt) busy.push({ startsAt, endsAt });
      }

      pageToken = data?.nextPageToken;

      if (!pageToken) break;
    }

    return busy;
  }

  public async upsertEvent(accessToken: string, event: CalendarEventInput, existingEventId: string | null): Promise<string> {
    const id = existingEventId ?? googleEventId(event.bookingId);
    const body = {
      summary: event.summary,
      description: event.description,
      ...(event.location ? { location: event.location } : {}),
      start: { dateTime: event.startsAt.toISOString() },
      end: { dateTime: event.endsAt.toISOString() },
      // Confirmed also restores an event deleted in the calendar.
      status: "confirmed",
      transparency: "opaque",
      extendedProperties: { private: { [CALENDAR_CONSTANTS.EVENT_PROPERTY]: event.bookingId } },
    };
    const updated = await calendarRequest<GoogleEvent>("GOOGLE", `${EVENTS_URL}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      accessToken,
      json: body,
      allow: [404, 410],
    });

    if (updated.status !== 404 && updated.status !== 410) return updated.data?.id ?? id;

    const created = await calendarRequest<GoogleEvent>("GOOGLE", EVENTS_URL, {
      method: "POST",
      accessToken,
      json: { id, ...body },
    });

    return created.data?.id ?? id;
  }

  public async deleteEvent(accessToken: string, eventId: string): Promise<void> {
    await calendarRequest("GOOGLE", `${EVENTS_URL}/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      accessToken,
      allow: [404, 410],
    });
  }

  public async watch(accessToken: string, request: WatchRequest): Promise<CalendarWatch> {
    const { data } = await calendarRequest<{ id: string; resourceId: string; expiration?: string }>(
      "GOOGLE",
      `${EVENTS_URL}/watch`,
      {
        method: "POST",
        accessToken,
        json: {
          id: randomUUID(),
          type: "web_hook",
          address: request.address,
          token: request.token,
          expiration: String(request.expiresAt.getTime()),
        },
      },
    );

    if (!data?.id) throw new CalendarApiError("Google did not open a push channel", "transient");

    return {
      channelId: data.id,
      resourceId: data.resourceId,
      expiresAt: data.expiration ? new Date(Number(data.expiration)) : request.expiresAt,
    };
  }

  /** Google channels can't be extended: open a new one, then close the old. */
  public async renewWatch(accessToken: string, current: CalendarWatch, request: WatchRequest): Promise<RenewedWatch> {
    const watch = await this.watch(accessToken, request);

    await this.stopWatch(accessToken, current).catch(() => undefined);

    return { watch, usesNewToken: true };
  }

  public async stopWatch(accessToken: string, watch: CalendarWatch): Promise<void> {
    await calendarRequest("GOOGLE", `${CALENDAR_CONSTANTS.GOOGLE_API_URL}/channels/stop`, {
      method: "POST",
      accessToken,
      json: { id: watch.channelId, resourceId: watch.resourceId },
      allow: [404],
    });
  }

  public async revoke(refreshToken: string): Promise<void> {
    await calendarRequest("GOOGLE", CALENDAR_CONSTANTS.GOOGLE_REVOKE_URL, {
      form: { token: refreshToken },
      allow: [400],
    });
  }
}
