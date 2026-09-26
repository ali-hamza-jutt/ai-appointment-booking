import * as Sentry from "@sentry/browser";

import { isApiError } from "@/lib/api/api-error";
import { publicEnv } from "@/lib/config/public-env";

let enabled = false;

/** Starts browser error reporting; a no-op without a DSN. */
export function initErrorReporting(): void {
  if (enabled || !publicEnv.sentryDsn || typeof window === "undefined") return;

  Sentry.init({
    dsn: publicEnv.sentryDsn,
    environment: process.env.NODE_ENV,
    ...(publicEnv.release ? { release: publicEnv.release } : {}),
  });
  enabled = true;
}

/**
 * Reports an error, tagged with the API request id when there is one so the
 * browser report can be matched to server logs and traces.
 */
export function reportError(error: unknown, digest?: string): void {
  if (!enabled) return;

  Sentry.withScope((scope) => {
    if (isApiError(error)) {
      scope.setTag("api_error_code", error.code);
      if (error.requestId) scope.setTag("request_id", error.requestId);
    }
    if (digest) scope.setTag("digest", digest);

    Sentry.captureException(error);
  });
}
