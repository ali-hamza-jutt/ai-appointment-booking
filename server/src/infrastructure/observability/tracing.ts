import {
  context,
  propagation,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
} from "@opentelemetry/api";

import { OBSERVABILITY_CONSTANTS } from "../../constants/app.constants.js";

const tracer = trace.getTracer(OBSERVABILITY_CONSTANTS.TRACER_NAME);

/** W3C trace headers, stored with work that continues in another process. */
export type TraceCarrier = Record<string, string>;

/** Runs `work` in a child span, recording failures on it. */
export function withSpan<Result>(
  name: string,
  attributes: Attributes,
  work: (span: Span) => Promise<Result>,
): Promise<Result> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await work(span);
    } catch (error) {
      span.recordException(error instanceof Error ? error : String(error));
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}

/** The current trace position, to hand to a job that runs later. */
export function captureTraceContext(): TraceCarrier {
  const carrier: TraceCarrier = {};

  propagation.inject(context.active(), carrier);

  return carrier;
}

/** Continues the trace captured by `captureTraceContext` while running `work`. */
export function withTraceContext<Result>(carrier: TraceCarrier | undefined, work: () => Result): Result {
  if (!carrier) return work();

  return context.with(propagation.extract(context.active(), carrier), work);
}

/** Trace and span ids for log lines, when a span is active. */
export function activeTraceIds(): { traceId: string; spanId: string } | undefined {
  const spanContext = trace.getActiveSpan()?.spanContext();

  return spanContext && trace.isSpanContextValid(spanContext)
    ? { traceId: spanContext.traceId, spanId: spanContext.spanId }
    : undefined;
}
