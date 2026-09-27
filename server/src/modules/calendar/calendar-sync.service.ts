import { createHash, randomBytes } from "node:crypto";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { CALENDAR_CONSTANTS } from "../../constants/app.constants.js";
import { createCalendarClients, type CalendarClients } from "../../integrations/calendar/calendar-clients.js";
import { CalendarApiError } from "../../integrations/calendar/calendar-http.js";
import type { CalendarEventInput, CalendarProviderClient } from "../../integrations/calendar/calendar.dto.js";
import { openSecret, sealSecret } from "../../utils/secret-box.js";
import { availabilityCache } from "../availability/availability-cache.js";
import { busyFingerprint, mergeBusyIntervals } from "./busy-intervals.js";
import { CALENDAR_EVENT_STATUSES, calendarDal } from "./dal/calendar.dal.js";
import type { BookingCalendarRecord, CalendarConnectionRecord } from "./dto/calendar.dto.js";

const MINUTE = 60_000;

export function hashChannelToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Push notifications need a public HTTPS address; without one, the 15-minute sweep keeps calendars in step. */
export function pushNotificationsEnabled(): boolean {
  return env.API_PUBLIC_URL.startsWith("https://");
}

function truncate(text: string): string {
  return text.length > CALENDAR_CONSTANTS.MAX_ERROR_LENGTH ? `${text.slice(0, CALENDAR_CONSTANTS.MAX_ERROR_LENGTH - 1)}…` : text;
}

/**
 * Keeps staff calendars and bookings in step. Busy times flow in (and
 * block availability like time off); confirmed bookings flow out as events
 * on the staff member's calendar.
 */
export class CalendarSyncService {
  private readonly key: Buffer | null;

  public constructor(private readonly clients: CalendarClients = createCalendarClients()) {
    this.key = env.TOKEN_ENCRYPTION_KEY ? Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64") : null;
  }

  public clientFor(provider: CalendarConnectionRecord["provider"]): CalendarProviderClient | null {
    return this.clients[provider] ?? null;
  }

  public seal(value: string): string {
    if (!this.key) throw new Error("TOKEN_ENCRYPTION_KEY is not set");

    return sealSecret(value, this.key);
  }

  public open(value: string): string | null {
    return this.key ? openSecret(value, this.key) : null;
  }

  /**
   * Imports the calendar's busy times, keeps the push channel alive and
   * writes any upcoming bookings that are missing from the calendar.
   */
  public async syncConnection(businessId: string, connectionId: string, now: Date = new Date()): Promise<void> {
    const connection = await calendarDal.findConnection(businessId, connectionId);

    if (!connection || connection.status !== "ACTIVE") return;

    const range = {
      from: new Date(now.getTime() - CALENDAR_CONSTANTS.LOOKBACK_MINUTES * MINUTE),
      to: new Date(now.getTime() + CALENDAR_CONSTANTS.HORIZON_DAYS * 24 * 60 * MINUTE),
    };
    const ownEventIds = new Set(await calendarDal.listEventIds(businessId, connectionId));
    const busy = await this.call(connection, (client, token) => client.listBusy(token, range, ownEventIds));

    if (busy === null) return;

    const merged = mergeBusyIntervals(busy, range);
    const fingerprint = busyFingerprint(merged);

    if (fingerprint !== connection.busyHash) {
      await calendarDal.replaceBusy(connection, merged, fingerprint);
      await availabilityCache.invalidate(businessId);
    }

    await this.ensureWatch(connection, now);

    for (const bookingId of await calendarDal.listBookingsToWrite(connection, now, CALENDAR_CONSTANTS.BACKFILL_LIMIT)) {
      await this.reconcileBooking(businessId, bookingId);
    }

    await calendarDal.recordSync(businessId, connectionId, now, null);
  }

  /**
   * Makes the staff member's calendar match the booking as it is now: an
   * event while it is confirmed (or done), none once cancelled, and moved to
   * the new staff member's calendar when the booking changes hands.
   */
  public async reconcileBooking(businessId: string, bookingId: string): Promise<void> {
    const booking = await calendarDal.findBookingForCalendar(businessId, bookingId);

    if (!booking) return;

    const wanted =
      booking.staffId && CALENDAR_EVENT_STATUSES.has(booking.status)
        ? await calendarDal.findConnectionForStaff(businessId, booking.staffId)
        : null;
    const target = wanted?.status === "ACTIVE" ? wanted : null;

    if (booking.calendarConnectionId && booking.calendarEventId && booking.calendarConnectionId !== target?.id) {
      const previous = await calendarDal.findConnection(businessId, booking.calendarConnectionId);
      const eventId = booking.calendarEventId;

      // A calendar that refuses the delete keeps a stray event; the booking still moves on.
      if (previous?.status === "ACTIVE") {
        await this.call(previous, (client, token) => client.deleteEvent(token, eventId));
      }

      await calendarDal.setBookingEvent(businessId, bookingId, null, null);
    }

    if (!target) return;

    const existingId = booking.calendarConnectionId === target.id ? booking.calendarEventId : null;
    const eventId = await this.call(target, (client, token) => client.upsertEvent(token, this.eventFor(booking), existingId));

    if (eventId && (eventId !== booking.calendarEventId || booking.calendarConnectionId !== target.id)) {
      await calendarDal.setBookingEvent(businessId, bookingId, target.id, eventId);
    }
  }

  /** Stops the push channel and forgets the grant; each step is best effort. */
  public async release(connection: CalendarConnectionRecord): Promise<void> {
    const client = this.clientFor(connection.provider);
    const refreshToken = this.open(connection.refreshTokenEncrypted);

    if (!client) return;

    if (connection.channelId) {
      await this.call(connection, (provider, token) =>
        provider
          .stopWatch(token, {
            channelId: connection.channelId ?? "",
            resourceId: connection.channelResourceId,
            expiresAt: connection.channelExpiresAt ?? new Date(),
          })
          .then(() => true),
      ).catch((error: unknown) => logger.warn({ err: error }, "Stopping a calendar channel failed"));
    }

    if (refreshToken) {
      await client.revoke(refreshToken).catch((error: unknown) => logger.warn({ err: error }, "Revoking a calendar grant failed"));
    }
  }

  /** Opens or extends the push channel when it is missing or about to expire. */
  private async ensureWatch(connection: CalendarConnectionRecord, now: Date): Promise<void> {
    if (!pushNotificationsEnabled()) return;

    const renewBy = new Date(now.getTime() + CALENDAR_CONSTANTS.RENEW_CHANNEL_BEFORE_MINUTES * MINUTE);

    if (connection.channelId && connection.channelExpiresAt && connection.channelExpiresAt > renewBy) return;

    const ttl =
      connection.provider === "GOOGLE"
        ? CALENDAR_CONSTANTS.GOOGLE_CHANNEL_TTL_MINUTES
        : CALENDAR_CONSTANTS.MICROSOFT_SUBSCRIPTION_TTL_MINUTES;
    const secret = randomBytes(24).toString("base64url");
    const request = {
      address: new URL(
        connection.provider === "GOOGLE" ? CALENDAR_CONSTANTS.GOOGLE_WEBHOOK_PATH : CALENDAR_CONSTANTS.MICROSOFT_WEBHOOK_PATH,
        env.API_PUBLIC_URL,
      ).toString(),
      token: secret,
      expiresAt: new Date(now.getTime() + ttl * MINUTE),
    };

    try {
      const result = await this.call(connection, async (client, token) => {
        if (!connection.channelId) return { watch: await client.watch(token, request), usesNewToken: true };

        return client.renewWatch(
          token,
          {
            channelId: connection.channelId,
            resourceId: connection.channelResourceId,
            expiresAt: connection.channelExpiresAt ?? now,
          },
          request,
        );
      });

      if (!result) return;

      await calendarDal.saveWatch(connection.businessId, connection.id, {
        channelId: result.watch.channelId,
        channelResourceId: result.watch.resourceId,
        channelTokenHash: result.usesNewToken ? hashChannelToken(secret) : connection.channelTokenHash,
        channelExpiresAt: result.watch.expiresAt,
      });
    } catch (error) {
      // The sweep still keeps the calendar in step without push notifications.
      logger.warn({ err: error, connectionId: connection.id }, "Calendar push channel could not be opened");
    }
  }

  /**
   * Runs a provider call with a fresh access token. A refused grant marks
   * the connection for reconnecting, a refused request is recorded, and
   * both return null; temporary failures are thrown so the job is retried.
   */
  private async call<Result>(
    connection: CalendarConnectionRecord,
    work: (client: CalendarProviderClient, accessToken: string) => Promise<Result>,
  ): Promise<Result | null> {
    const client = this.clientFor(connection.provider);

    if (!client) return null;

    try {
      try {
        return await work(client, await this.accessToken(connection, client, false));
      } catch (error) {
        // An access token can be revoked before it expires; try once with a new one.
        if (!(error instanceof CalendarApiError) || error.kind !== "auth") throw error;

        return await work(client, await this.accessToken(connection, client, true));
      }
    } catch (error) {
      if (!(error instanceof CalendarApiError) || error.kind === "transient") throw error;

      if (error.kind === "auth") {
        await calendarDal.markNeedsReconnect(connection.businessId, connection.id, truncate(error.message));
      } else {
        await calendarDal.recordSync(connection.businessId, connection.id, new Date(), truncate(error.message));
      }

      logger.warn({ err: error, connectionId: connection.id }, "Calendar request refused");

      return null;
    }
  }

  private async accessToken(
    connection: CalendarConnectionRecord,
    client: CalendarProviderClient,
    forceRefresh: boolean,
  ): Promise<string> {
    const cached = connection.accessTokenEncrypted ? this.open(connection.accessTokenEncrypted) : null;
    const freshUntil = Date.now() + CALENDAR_CONSTANTS.ACCESS_TOKEN_SKEW_SECONDS * 1_000;

    if (!forceRefresh && cached && connection.accessTokenExpiresAt && connection.accessTokenExpiresAt.getTime() > freshUntil) {
      return cached;
    }

    const refreshToken = this.open(connection.refreshTokenEncrypted);

    if (!refreshToken) throw new CalendarApiError("The stored calendar grant can't be read", "auth");

    const tokens = await client.refreshAccessToken(refreshToken);
    const sealed = {
      accessTokenEncrypted: this.seal(tokens.accessToken),
      accessTokenExpiresAt: tokens.expiresAt,
      ...(tokens.refreshToken ? { refreshTokenEncrypted: this.seal(tokens.refreshToken) } : {}),
    };

    await calendarDal.saveTokens(connection.businessId, connection.id, sealed);
    Object.assign(connection, sealed);

    return tokens.accessToken;
  }

  private eventFor(booking: BookingCalendarRecord): CalendarEventInput {
    const location = booking.service?.location ?? booking.business.locations[0] ?? null;
    const contact = [booking.customer.email, booking.customer.phone].filter(Boolean).join(" · ");

    return {
      bookingId: booking.id,
      summary: `${booking.serviceName} · ${booking.customer.name}`,
      description: [
        `${booking.customer.name}${contact ? ` (${contact})` : ""}`,
        ...(booking.notes ? [`Notes: ${booking.notes}`] : []),
        `Booked through BookWise for ${booking.business.name}: ${new URL(CALENDAR_CONSTANTS.BOOKINGS_PATH, env.WEB_ORIGIN).toString()}`,
      ].join("\n"),
      location: location ? (location.address ? `${location.name}, ${location.address}` : location.name) : null,
      startsAt: booking.scheduledAt,
      endsAt: booking.endsAt,
    };
  }
}

export const calendarSyncService = new CalendarSyncService();
