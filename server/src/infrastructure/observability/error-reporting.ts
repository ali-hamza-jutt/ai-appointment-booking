import * as Sentry from "@sentry/node";

import { env } from "../../config/env.js";
import { getRequestId } from "./request-context.js";
import { activeTraceIds } from "./tracing.js";

let enabled = false;

/**
 * Sentry receives unexpected errors only; tracing stays with OpenTelemetry,
 * so Sentry does not install its own tracer provider.
 */
export function initErrorReporting(serviceName: string): void {
  if (enabled || !env.SENTRY_DSN || env.NODE_ENV === "test") return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    serverName: serviceName,
    ...(env.APP_RELEASE ? { release: env.APP_RELEASE } : {}),
  });
  enabled = true;
}

/** Reports an unexpected error with the ids needed to find its logs and trace. */
export function reportError(error: unknown, context: Record<string, string | number | undefined> = {}): void {
  if (!enabled) return;

  const requestId = getRequestId();
  const trace = activeTraceIds();

  Sentry.withScope((scope) => {
    if (requestId) scope.setTag("request_id", requestId);
    if (trace) scope.setTag("trace_id", trace.traceId);

    for (const [key, value] of Object.entries(context)) {
      if (value !== undefined) scope.setExtra(key, value);
    }

    Sentry.captureException(error);
  });
}

export async function flushErrorReporting(): Promise<void> {
  if (enabled) await Sentry.flush(2_000);
}
