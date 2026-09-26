import { metrics, type Attributes } from "@opentelemetry/api";
import { MeterProvider, MetricReader, type DataPoint } from "@opentelemetry/sdk-metrics";

import { resetMetricInstruments } from "../../src/infrastructure/observability/metrics.js";

class TestMetricReader extends MetricReader {
  protected onForceFlush(): Promise<void> {
    return Promise.resolve();
  }

  protected onShutdown(): Promise<void> {
    return Promise.resolve();
  }
}

/** Installs a meter provider that tests can read back from. */
export function installTestMeter() {
  const reader = new TestMetricReader();

  metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));
  resetMetricInstruments();

  /** Data points of `name` whose attributes include `match`. */
  async function points(name: string, match: Attributes = {}): Promise<DataPoint<unknown>[]> {
    const { resourceMetrics } = await reader.collect();
    const metric = resourceMetrics.scopeMetrics
      .flatMap((scope) => scope.metrics)
      .find((item) => item.descriptor.name === name);

    return ((metric?.dataPoints ?? []) as DataPoint<unknown>[]).filter((point) =>
      Object.entries(match).every(([key, value]) => point.attributes[key] === value),
    );
  }

  /** Sum of a counter's matching data points. */
  async function total(name: string, match: Attributes = {}): Promise<number> {
    return (await points(name, match)).reduce((sum, point) => sum + Number(point.value), 0);
  }

  return { points, total };
}
