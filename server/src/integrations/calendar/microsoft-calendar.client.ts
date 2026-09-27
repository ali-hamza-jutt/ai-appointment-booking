import { CALENDAR_CONSTANTS } from "../../constants/app.constants.js";
import { CalendarApiError, calendarRequest } from "./calendar-http.js";
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

interface MicrosoftTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

interface GraphDateTime {
  dateTime: string;
  timeZone?: string;
}

interface GraphEvent {
  id: string;
  isCancelled?: boolean;
  showAs?: string;
  responseStatus?: { response?: string };
  start?: GraphDateTime;
  end?: GraphDateTime;
}

interface GraphPage<T> {
  value?: T[];
  "@odata.nextLink"?: string;
}

/** Graph statuses that mean the person can't take a booking. */
const BUSY_STATUSES = new Set(["busy", "tentative", "oof"]);
const GRAPH = CALENDAR_CONSTANTS.MICROSOFT_GRAPH_URL;

/**
 * Graph returns "2026-10-06T10:00:00.0000000" in the zone asked for (UTC
 * here); JavaScript wants at most milliseconds and an explicit zone.
 */
export function parseGraphUtc(value: string | undefined): Date | null {
  if (!value) return null;

  const instant = new Date(`${value.replace(/(\.\d{3})\d+$/, "$1")}Z`);

  return Number.isNaN(instant.getTime()) ? null : instant;
}

/** Graph wants wall-clock time plus a zone, not an offset. */
function graphUtc(value: Date): GraphDateTime {
  return { dateTime: value.toISOString().replace(/Z$/, ""), timeZone: "UTC" };
}

export class MicrosoftCalendarClient implements CalendarProviderClient {
  public readonly provider = "MICROSOFT" as const;

  public constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly tenantId: string,
  ) {}

  public authorizationUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string {
    const url = new URL(`${this.oauthBase()}/authorize`);

    url.search = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      redirect_uri: input.redirectUri,
      response_mode: "query",
      scope: CALENDAR_CONSTANTS.MICROSOFT_SCOPES,
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();

    return url.toString();
  }

  public async exchangeCode(input: { code: string; codeVerifier: string; redirectUri: string }): Promise<CalendarGrant> {
    const tokens = await this.token({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    });

    if (!tokens.refreshToken) throw new CalendarApiError("Microsoft did not return a refresh token", "rejected");

    const { data } = await calendarRequest<{ mail?: string | null; userPrincipalName?: string }>(
      "MICROSOFT",
      `${GRAPH}/me?$select=mail,userPrincipalName`,
      { accessToken: tokens.accessToken },
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      accountEmail: data?.mail ?? data?.userPrincipalName ?? "Microsoft account",
    };
  }

  /** Microsoft may rotate the refresh token; the new one replaces the old. */
  public refreshAccessToken(refreshToken: string): Promise<CalendarTokens> {
    return this.token({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  public async listBusy(
    accessToken: string,
    range: { from: Date; to: Date },
    ownEventIds: ReadonlySet<string>,
  ): Promise<BusyInterval[]> {
    const busy: BusyInterval[] = [];
    const first = new URL(`${GRAPH}/me/calendarView`);

    first.search = new URLSearchParams({
      startDateTime: range.from.toISOString(),
      endDateTime: range.to.toISOString(),
      $select: "id,start,end,showAs,isCancelled,responseStatus",
      $top: "250",
    }).toString();

    let next: string | undefined = first.toString();

    for (let page = 0; next && page < CALENDAR_CONSTANTS.MAX_PAGES; page += 1) {
      const response: { data: GraphPage<GraphEvent> | null } = await calendarRequest<GraphPage<GraphEvent>>("MICROSOFT", next, {
        accessToken,
        headers: { Prefer: 'outlook.timezone="UTC"' },
      });

      for (const event of response.data?.value ?? []) {
        if (
          event.isCancelled ||
          !BUSY_STATUSES.has(event.showAs ?? "busy") ||
          event.responseStatus?.response === "declined" ||
          ownEventIds.has(event.id)
        ) {
          continue;
        }

        const startsAt = parseGraphUtc(event.start?.dateTime);
        const endsAt = parseGraphUtc(event.end?.dateTime);

        if (startsAt && endsAt && endsAt > startsAt) busy.push({ startsAt, endsAt });
      }

      next = response.data?.["@odata.nextLink"];
    }

    return busy;
  }

  public async upsertEvent(accessToken: string, event: CalendarEventInput, existingEventId: string | null): Promise<string> {
    const body = {
      subject: event.summary,
      body: { contentType: "text", content: event.description },
      start: graphUtc(event.startsAt),
      end: graphUtc(event.endsAt),
      ...(event.location ? { location: { displayName: event.location } } : {}),
      showAs: "busy",
    };

    if (existingEventId) {
      const updated = await calendarRequest<GraphEvent>("MICROSOFT", `${GRAPH}/me/events/${encodeURIComponent(existingEventId)}`, {
        method: "PATCH",
        accessToken,
        json: body,
        allow: [404],
      });

      if (updated.status !== 404) return updated.data?.id ?? existingEventId;
    }

    // Graph drops a repeated create that carries the same transaction id.
    const created = await calendarRequest<GraphEvent>("MICROSOFT", `${GRAPH}/me/events`, {
      method: "POST",
      accessToken,
      json: { ...body, transactionId: event.bookingId },
    });

    if (!created.data?.id) throw new CalendarApiError("Microsoft returned no event id", "transient");

    return created.data.id;
  }

  public async deleteEvent(accessToken: string, eventId: string): Promise<void> {
    await calendarRequest("MICROSOFT", `${GRAPH}/me/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      accessToken,
      allow: [404],
    });
  }

  public async watch(accessToken: string, request: WatchRequest): Promise<CalendarWatch> {
    const { data } = await calendarRequest<{ id: string; expirationDateTime: string }>("MICROSOFT", `${GRAPH}/subscriptions`, {
      method: "POST",
      accessToken,
      json: {
        changeType: "created,updated,deleted",
        notificationUrl: request.address,
        resource: "me/events",
        expirationDateTime: request.expiresAt.toISOString(),
        clientState: request.token,
      },
    });

    if (!data?.id) throw new CalendarApiError("Microsoft did not create a subscription", "transient");

    return { channelId: data.id, resourceId: null, expiresAt: new Date(data.expirationDateTime) };
  }

  /** Subscriptions are extended in place and keep their original secret. */
  public async renewWatch(accessToken: string, current: CalendarWatch, request: WatchRequest): Promise<RenewedWatch> {
    const { status, data } = await calendarRequest<{ id: string; expirationDateTime: string }>(
      "MICROSOFT",
      `${GRAPH}/subscriptions/${encodeURIComponent(current.channelId)}`,
      { method: "PATCH", accessToken, json: { expirationDateTime: request.expiresAt.toISOString() }, allow: [404] },
    );

    if (status === 404 || !data) return { watch: await this.watch(accessToken, request), usesNewToken: true };

    return {
      watch: { channelId: current.channelId, resourceId: null, expiresAt: new Date(data.expirationDateTime) },
      usesNewToken: false,
    };
  }

  public async stopWatch(accessToken: string, watch: CalendarWatch): Promise<void> {
    await calendarRequest("MICROSOFT", `${GRAPH}/subscriptions/${encodeURIComponent(watch.channelId)}`, {
      method: "DELETE",
      accessToken,
      allow: [404],
    });
  }

  /** Microsoft has no revocation endpoint for this flow; disconnecting forgets the tokens. */
  public revoke(): Promise<void> {
    return Promise.resolve();
  }

  private oauthBase(): string {
    return `${CALENDAR_CONSTANTS.MICROSOFT_LOGIN_URL}/${encodeURIComponent(this.tenantId)}/oauth2/v2.0`;
  }

  private async token(grant: Record<string, string>): Promise<CalendarTokens> {
    const now = new Date();
    const { data } = await calendarRequest<MicrosoftTokenResponse>("MICROSOFT", `${this.oauthBase()}/token`, {
      form: {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: CALENDAR_CONSTANTS.MICROSOFT_SCOPES,
        ...grant,
      },
    });

    if (!data?.access_token) throw new CalendarApiError("Microsoft returned no access token", "transient");

    return {
      accessToken: data.access_token,
      expiresAt: new Date(now.getTime() + data.expires_in * 1_000),
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
    };
  }
}
