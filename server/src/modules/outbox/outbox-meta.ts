import { getRequestId } from "../../infrastructure/observability/request-context.js";
import {
  captureTraceContext,
  type TraceCarrier,
} from "../../infrastructure/observability/tracing.js";

/** Where an event came from, so the worker can continue its logs and trace. */
export interface OutboxMeta {
  requestId: string | null;
  trace: TraceCarrier;
}

export function currentOutboxMeta(): OutboxMeta {
  return { requestId: getRequestId() ?? null, trace: captureTraceContext() };
}

export function readOutboxMeta(payload: Record<string, unknown>): OutboxMeta {
  const meta = payload.meta as Partial<OutboxMeta> | undefined;
  const trace =
    meta?.trace && typeof meta.trace === "object"
      ? Object.fromEntries(
          Object.entries(meta.trace).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        )
      : {};

  return { requestId: typeof meta?.requestId === "string" ? meta.requestId : null, trace };
}
