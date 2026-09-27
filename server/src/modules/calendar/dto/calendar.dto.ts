import type { CalendarProviderName } from "../../../integrations/calendar/calendar.dto.js";
import type { BookingStatus } from "../../bookings/dto/booking.dto.js";

export type CalendarProvider = CalendarProviderName;

export type CalendarConnectionStatus = "ACTIVE" | "NEEDS_RECONNECT";

export interface CalendarProvidersResponse {
  google: boolean;
  microsoft: boolean;
}

export interface CalendarConnectionResponse {
  staffId: string;
  provider: CalendarProvider;
  status: CalendarConnectionStatus;
  /** The account the staff member signed in with. */
  accountEmail: string;
  lastSyncedAt: Date | null;
  lastError: string | null;
  /** True when the provider reports changes as they happen; otherwise the calendar is checked every 15 minutes. */
  liveUpdates: boolean;
  connectedAt: Date;
}

export interface CalendarConnectionListResponse {
  items: CalendarConnectionResponse[];
}

export interface StartCalendarConnectionRequest {
  provider: CalendarProvider;
}

export interface StartCalendarConnectionResponse {
  /** Send the browser here to sign in with the provider. */
  authorizationUrl: string;
}

/** Sealed into the OAuth state, so the callback knows who started it. */
export interface CalendarOAuthState {
  provider: CalendarProvider;
  businessId: string;
  staffId: string;
  userId: string;
  codeVerifier: string;
  expiresAt: number;
}

export interface CalendarConnectionRecord {
  id: string;
  businessId: string;
  staffId: string;
  provider: CalendarProvider;
  status: CalendarConnectionStatus;
  accountEmail: string;
  refreshTokenEncrypted: string;
  accessTokenEncrypted: string | null;
  accessTokenExpiresAt: Date | null;
  channelId: string | null;
  channelResourceId: string | null;
  channelTokenHash: string | null;
  channelExpiresAt: Date | null;
  busyHash: string | null;
  lastSyncedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}

export interface SaveCalendarConnectionData {
  businessId: string;
  staffId: string;
  provider: CalendarProvider;
  accountEmail: string;
  refreshTokenEncrypted: string;
  accessTokenEncrypted: string;
  accessTokenExpiresAt: Date;
}

export interface CalendarWatchData {
  channelId: string;
  channelResourceId: string | null;
  channelTokenHash: string | null;
  channelExpiresAt: Date;
}

/** A booking as its staff member's calendar needs it. */
export interface BookingCalendarRecord {
  id: string;
  businessId: string;
  staffId: string | null;
  status: BookingStatus;
  scheduledAt: Date;
  endsAt: Date;
  serviceName: string;
  notes: string | null;
  calendarEventId: string | null;
  calendarConnectionId: string | null;
  customer: { name: string; email: string | null; phone: string | null };
  service: { location: { name: string; address: string | null } | null } | null;
  business: { name: string; locations: Array<{ name: string; address: string | null }> };
}

export interface StaffCalendarAccessRecord {
  id: string;
  userId: string | null;
}

export interface CalendarSyncJobData {
  businessId: string;
  connectionId: string;
}
