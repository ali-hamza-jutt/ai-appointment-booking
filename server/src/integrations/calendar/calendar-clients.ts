import { env } from "../../config/env.js";
import type { CalendarProviderClient, CalendarProviderName } from "./calendar.dto.js";
import { GoogleCalendarClient } from "./google-calendar.client.js";
import { MicrosoftCalendarClient } from "./microsoft-calendar.client.js";

export type CalendarClients = Partial<Record<CalendarProviderName, CalendarProviderClient>>;

/**
 * The providers this deployment can sync with: each needs its OAuth app
 * credentials, and all need TOKEN_ENCRYPTION_KEY to store tokens.
 */
export function createCalendarClients(): CalendarClients {
  if (!env.TOKEN_ENCRYPTION_KEY) return {};

  return {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { GOOGLE: new GoogleCalendarClient(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET) }
      : {}),
    ...(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET
      ? {
          MICROSOFT: new MicrosoftCalendarClient(
            env.MICROSOFT_CLIENT_ID,
            env.MICROSOFT_CLIENT_SECRET,
            env.MICROSOFT_TENANT_ID,
          ),
        }
      : {}),
  };
}
