import { createHash, timingSafeEqual } from "node:crypto";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import {
  CALENDAR_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  VALIDATION_PATTERNS,
} from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import type { AuthenticatedBusinessRole } from "../../models/authenticated-user.js";
import { createOpaqueToken } from "../../utils/secure-token.js";
import { availabilityCache } from "../availability/availability-cache.js";
import { calendarSyncQueue, type CalendarSyncQueue } from "./calendar-sync.queue.js";
import {
  calendarSyncService,
  hashChannelToken,
  pushNotificationsEnabled,
  type CalendarSyncService,
} from "./calendar-sync.service.js";
import { calendarDal } from "./dal/calendar.dal.js";
import type {
  CalendarConnectionListResponse,
  CalendarConnectionRecord,
  CalendarConnectionResponse,
  CalendarOAuthState,
  CalendarProvider,
  CalendarProvidersResponse,
  StartCalendarConnectionResponse,
} from "./dto/calendar.dto.js";

const MINUTE = 60_000;

function redirectUri(): string {
  return new URL(CALENDAR_CONSTANTS.CALLBACK_PATH, env.API_PUBLIC_URL).toString();
}

function dashboardUrl(result: "connected" | "error", reason?: string): string {
  const url = new URL(CALENDAR_CONSTANTS.RETURN_PATH, env.WEB_ORIGIN);

  url.searchParams.set("calendar", result);
  if (reason) url.searchParams.set("reason", reason);

  return url.toString();
}

function sameHash(expected: string | null, secret: string | undefined): boolean {
  if (!expected || !secret) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(hashChannelToken(secret));

  return a.length === b.length && timingSafeEqual(a, b);
}

/** Connecting, listing and disconnecting staff calendars, and reacting to provider notifications. */
export class CalendarConnectionService {
  public constructor(
    private readonly sync: CalendarSyncService = calendarSyncService,
    private readonly queue: Pick<CalendarSyncQueue, "enqueue"> = calendarSyncQueue,
  ) {}

  public providers(): CalendarProvidersResponse {
    return {
      google: this.sync.clientFor("GOOGLE") !== null,
      microsoft: this.sync.clientFor("MICROSOFT") !== null,
    };
  }

  public async listConnections(businessId: string): Promise<CalendarConnectionListResponse> {
    return { items: (await calendarDal.listConnections(businessId)).map((connection) => this.toResponse(connection)) };
  }

  /** The provider's consent URL; the staff member signs in there and comes back to the callback. */
  public async start(
    businessId: string,
    staffId: string,
    user: { id: string; role: AuthenticatedBusinessRole | null },
    provider: CalendarProvider,
  ): Promise<StartCalendarConnectionResponse> {
    await this.assertMayManage(businessId, staffId, user);

    const client = this.sync.clientFor(provider);

    if (!client) {
      throw new AppError(503, ERROR_CODES.CALENDAR_NOT_CONFIGURED, ERROR_MESSAGES.CALENDAR_NOT_CONFIGURED);
    }

    const codeVerifier = createOpaqueToken();
    const state: CalendarOAuthState = {
      provider,
      businessId,
      staffId,
      userId: user.id,
      codeVerifier,
      expiresAt: Date.now() + CALENDAR_CONSTANTS.STATE_TTL_MINUTES * MINUTE,
    };

    return {
      authorizationUrl: client.authorizationUrl({
        // Sealed, so the verifier stays secret and the state can't be forged or reused later.
        state: this.sync.seal(JSON.stringify(state)),
        codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url"),
        redirectUri: redirectUri(),
      }),
    };
  }

  /**
   * Finishes the OAuth round trip and returns where to send the browser.
   * Never throws: every failure becomes a message on the staff page.
   */
  public async complete(query: {
    code?: string | undefined;
    state?: string | undefined;
    error?: string | undefined;
  }): Promise<string> {
    if (query.error) return dashboardUrl("error", query.error === "access_denied" ? "denied" : "provider");

    const state = this.readState(query.state);

    if (!state || !query.code) return dashboardUrl("error", "invalid");
    if (state.expiresAt < Date.now()) return dashboardUrl("error", "expired");

    const client = this.sync.clientFor(state.provider);

    if (!client) return dashboardUrl("error", "unavailable");

    try {
      const grant = await client.exchangeCode({ code: query.code, codeVerifier: state.codeVerifier, redirectUri: redirectUri() });
      const previous = await calendarDal.findConnectionForStaff(state.businessId, state.staffId);

      if (previous) await this.sync.release(previous);

      const connection = await calendarDal.saveConnection({
        businessId: state.businessId,
        staffId: state.staffId,
        provider: state.provider,
        accountEmail: grant.accountEmail,
        refreshTokenEncrypted: this.sync.seal(grant.refreshToken),
        accessTokenEncrypted: this.sync.seal(grant.accessToken),
        accessTokenExpiresAt: grant.expiresAt,
      });

      await availabilityCache.invalidate(state.businessId);
      await this.queue.enqueue({ businessId: state.businessId, connectionId: connection.id });

      return dashboardUrl("connected");
    } catch (error) {
      logger.warn({ err: error, provider: state.provider }, "Connecting a calendar failed");

      return dashboardUrl("error", "failed");
    }
  }

  public async disconnect(
    businessId: string,
    staffId: string,
    user: { id: string; role: AuthenticatedBusinessRole | null },
  ): Promise<void> {
    const connection = await this.requireConnection(businessId, staffId, user);

    await this.sync.release(connection);
    await calendarDal.deleteConnection(businessId, connection.id);
    await availabilityCache.invalidate(businessId);
  }

  public async requestSync(
    businessId: string,
    staffId: string,
    user: { id: string; role: AuthenticatedBusinessRole | null },
  ): Promise<void> {
    const connection = await this.requireConnection(businessId, staffId, user);

    await this.queue.enqueue({ businessId, connectionId: connection.id });
  }

  /** A Google push notification: sync the channel's calendar unless it is the opening handshake. */
  public async handleGoogleNotification(headers: {
    channelId?: string | undefined;
    channelToken?: string | undefined;
    resourceState?: string | undefined;
  }): Promise<void> {
    if (!headers.channelId || headers.resourceState === "sync") return;

    await this.syncChannel(headers.channelId, headers.channelToken);
  }

  /** Microsoft Graph notifications, each naming its subscription and our secret. */
  public async handleMicrosoftNotifications(body: unknown): Promise<void> {
    const value = typeof body === "object" && body !== null ? (body as { value?: unknown }).value : undefined;

    if (!Array.isArray(value)) return;

    const seen = new Set<string>();

    for (const item of value) {
      const notification = item as { subscriptionId?: unknown; clientState?: unknown };

      if (typeof notification.subscriptionId !== "string" || seen.has(notification.subscriptionId)) continue;

      seen.add(notification.subscriptionId);
      await this.syncChannel(
        notification.subscriptionId,
        typeof notification.clientState === "string" ? notification.clientState : undefined,
      );
    }
  }

  public toResponse(connection: CalendarConnectionRecord): CalendarConnectionResponse {
    return {
      staffId: connection.staffId,
      provider: connection.provider,
      status: connection.status,
      accountEmail: connection.accountEmail,
      lastSyncedAt: connection.lastSyncedAt,
      lastError: connection.lastError,
      liveUpdates:
        pushNotificationsEnabled() && connection.channelExpiresAt !== null && connection.channelExpiresAt > new Date(),
      connectedAt: connection.createdAt,
    };
  }

  private readState(sealed: string | undefined): CalendarOAuthState | null {
    const opened = sealed ? this.sync.open(sealed) : null;

    try {
      return opened ? (JSON.parse(opened) as CalendarOAuthState) : null;
    } catch {
      return null;
    }
  }

  private async syncChannel(channelId: string, secret: string | undefined): Promise<void> {
    const connection = await calendarDal.findConnectionByChannel(channelId);

    if (!connection || !sameHash(connection.channelTokenHash, secret)) {
      logger.warn({ channelId }, "Ignored a calendar notification that did not match a channel");
      return;
    }

    await this.queue.enqueue(
      { businessId: connection.businessId, connectionId: connection.id },
      CALENDAR_CONSTANTS.PUSH_SYNC_DELAY_MS,
    );
  }

  private async requireConnection(
    businessId: string,
    staffId: string,
    user: { id: string; role: AuthenticatedBusinessRole | null },
  ): Promise<CalendarConnectionRecord> {
    await this.assertMayManage(businessId, staffId, user);

    const connection = await calendarDal.findConnectionForStaff(businessId, staffId);

    if (!connection) {
      throw new AppError(404, ERROR_CODES.CALENDAR_CONNECTION_NOT_FOUND, ERROR_MESSAGES.CALENDAR_CONNECTION_NOT_FOUND);
    }

    return connection;
  }

  /** Owners and managers may manage anyone's calendar; staff only their own. */
  private async assertMayManage(
    businessId: string,
    staffId: string,
    user: { id: string; role: AuthenticatedBusinessRole | null },
  ): Promise<void> {
    const staff = VALIDATION_PATTERNS.UUID.test(staffId) ? await calendarDal.findStaff(businessId, staffId) : null;

    if (!staff) throw new AppError(404, ERROR_CODES.STAFF_NOT_FOUND, ERROR_MESSAGES.STAFF_NOT_FOUND);

    if (user.role !== "OWNER" && user.role !== "MANAGER" && staff.userId !== user.id) {
      throw new AppError(403, ERROR_CODES.CALENDAR_NOT_YOUR_STAFF_PROFILE, ERROR_MESSAGES.CALENDAR_NOT_YOUR_STAFF_PROFILE);
    }
  }
}

export const calendarConnectionService = new CalendarConnectionService();
