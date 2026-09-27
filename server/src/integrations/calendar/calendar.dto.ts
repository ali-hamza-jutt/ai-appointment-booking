export type CalendarProviderName = "GOOGLE" | "MICROSOFT";

export interface CalendarTokens {
  accessToken: string;
  expiresAt: Date;
  /** Present when the provider issued a new refresh token. */
  refreshToken?: string;
}

/** What a completed OAuth consent gives us. */
export interface CalendarGrant {
  accessToken: string;
  expiresAt: Date;
  refreshToken: string;
  accountEmail: string;
}

export interface BusyInterval {
  startsAt: Date;
  endsAt: Date;
}

export interface CalendarEventInput {
  bookingId: string;
  summary: string;
  description: string;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
}

/** A push channel (Google) or subscription (Microsoft) that reports calendar changes. */
export interface CalendarWatch {
  channelId: string;
  resourceId: string | null;
  expiresAt: Date;
}

export interface WatchRequest {
  /** Where the provider posts change notifications. */
  address: string;
  /** Secret the provider sends back with each notification. */
  token: string;
  expiresAt: Date;
}

export interface RenewedWatch {
  watch: CalendarWatch;
  /** False when the provider kept the original secret (Microsoft renewals). */
  usesNewToken: boolean;
}

/**
 * One calendar provider's OAuth and Calendar API, reduced to what booking
 * sync needs. Implementations call the provider's REST API directly.
 */
export interface CalendarProviderClient {
  readonly provider: CalendarProviderName;
  authorizationUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string;
  exchangeCode(input: { code: string; codeVerifier: string; redirectUri: string }): Promise<CalendarGrant>;
  refreshAccessToken(refreshToken: string): Promise<CalendarTokens>;
  /**
   * Times the person is busy in the range: cancelled, declined, free and
   * BookWise's own events are left out.
   */
  listBusy(
    accessToken: string,
    range: { from: Date; to: Date },
    ownEventIds: ReadonlySet<string>,
  ): Promise<BusyInterval[]>;
  /** Creates or updates the booking's event and returns its id. */
  upsertEvent(accessToken: string, event: CalendarEventInput, existingEventId: string | null): Promise<string>;
  /** Removes an event; one that is already gone is fine. */
  deleteEvent(accessToken: string, eventId: string): Promise<void>;
  watch(accessToken: string, request: WatchRequest): Promise<CalendarWatch>;
  renewWatch(accessToken: string, current: CalendarWatch, request: WatchRequest): Promise<RenewedWatch>;
  stopWatch(accessToken: string, watch: CalendarWatch): Promise<void>;
  /** Best effort: tells the provider to forget the grant. */
  revoke(refreshToken: string): Promise<void>;
}
