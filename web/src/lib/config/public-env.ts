const DEFAULT_API_BASE_URL = "http://localhost:4000/api";

export const publicEnv = {
  apiBaseUrl:
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
    DEFAULT_API_BASE_URL,
  /** Enables browser error reporting when set. */
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
  release: process.env.NEXT_PUBLIC_APP_RELEASE || undefined,
} as const;
