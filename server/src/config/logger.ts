import pino from "pino";

import { getRequestId } from "../infrastructure/observability/request-context.js";
import { activeTraceIds } from "../infrastructure/observability/tracing.js";
import { env } from "./env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  /** Every line carries the request id and trace ids, so logs join traces and errors. */
  mixin() {
    const requestId = getRequestId();
    const trace = activeTraceIds();

    return {
      ...(requestId ? { requestId } : {}),
      ...(trace ? { traceId: trace.traceId, spanId: trace.spanId } : {}),
    };
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "passwordHash",
      "token",
      "apiKey",
      "*.apiKey",
      "MISTRAL_API_KEY",
      "*.MISTRAL_API_KEY",
    ],
    censor: "[REDACTED]",
  },
});
