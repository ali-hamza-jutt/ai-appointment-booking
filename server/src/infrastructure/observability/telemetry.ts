import {
  ExpressInstrumentation,
  ExpressLayerType,
} from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  BatchSpanProcessor,
  NoopSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { PrismaInstrumentation } from "@prisma/instrumentation";

import { env } from "../../config/env.js";
import { OBSERVABILITY_CONSTANTS } from "../../constants/app.constants.js";
import { initErrorReporting } from "./error-reporting.js";

export type ServiceRole = "api" | "worker";

let sdk: NodeSDK | undefined;

function metricsPortFor(role: ServiceRole): number | undefined {
  return role === "api" ? env.METRICS_PORT : env.WORKER_METRICS_PORT;
}

/**
 * Starts tracing and metrics before the app's modules load (see
 * `src/instrumentation.ts`). Traces go to an OTLP collector when
 * OTEL_EXPORTER_OTLP_ENDPOINT is set; metrics are served for Prometheus
 * when a metrics port is set. With neither, nothing is started.
 */
export function startTelemetry(role: ServiceRole): void {
  const serviceName =
    role === "api" ? OBSERVABILITY_CONSTANTS.API_SERVICE_NAME : OBSERVABILITY_CONSTANTS.WORKER_SERVICE_NAME;

  initErrorReporting(serviceName);

  const metricsPort = metricsPortFor(role);
  const otlpEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/\/$/, "");

  if (sdk || env.NODE_ENV === "test" || (!otlpEndpoint && !metricsPort)) return;

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: env.APP_RELEASE ?? "dev",
      "deployment.environment.name": env.NODE_ENV,
    }),
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(env.OTEL_TRACES_SAMPLE_RATIO),
    }),
    // Spans are still created without an exporter, so trace ids reach the logs.
    spanProcessors: [
      otlpEndpoint
        ? new BatchSpanProcessor(new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` }))
        : new NoopSpanProcessor(),
    ],
    ...(metricsPort ? { metricReaders: [new PrometheusExporter({ port: metricsPort })] } : {}),
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) =>
          OBSERVABILITY_CONSTANTS.UNTRACED_PATHS.some((path) => request.url?.startsWith(path)),
      }),
      // Route and handler spans only; one span per middleware is noise.
      new ExpressInstrumentation({ ignoreLayersType: [ExpressLayerType.MIDDLEWARE] }),
      // Only inside a traced request or job: the queue and outbox poll constantly.
      new PgInstrumentation({ requireParentSpan: true }),
      new IORedisInstrumentation({ requireParentSpan: true }),
      new PrismaInstrumentation(),
    ],
  });
  sdk.start();
}

export async function stopTelemetry(): Promise<void> {
  await sdk?.shutdown();
  sdk = undefined;
}
