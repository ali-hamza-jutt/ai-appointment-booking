import { metrics, type Attributes } from "@opentelemetry/api";

import { OBSERVABILITY_CONSTANTS } from "../../constants/app.constants.js";

type BookingAttemptOutcome = "held" | "confirmed" | "pending" | "conflict" | "rejected" | "error";
type LlmOutcome = "success" | "error";
type JobOutcome = "success" | "error";

/**
 * Instruments are created on first use, after the SDK (or a test) has
 * installed a meter provider; the metrics API has no proxy meter.
 */
function createInstruments() {
  const meter = metrics.getMeter(OBSERVABILITY_CONSTANTS.METER_NAME);
  const { LATENCY_BUCKETS_SECONDS, HOLD_TO_CONFIRM_BUCKETS_SECONDS } = OBSERVABILITY_CONSTANTS;
  let oldestUnpublishedSeconds: number | null = null;

  return {
    bookingAttempts: meter.createCounter("bookwise_booking_attempts", {
      description: "Attempts to hold or book a slot, by outcome",
    }),
    slotConflicts: meter.createCounter("bookwise_booking_slot_conflicts", {
      description: "Booking attempts rejected because the slot was taken",
    }),
    holdToConfirm: meter.createHistogram("bookwise_booking_hold_to_confirm_seconds", {
      description: "Time from holding a slot to confirming it",
      unit: "s",
      advice: { explicitBucketBoundaries: [...HOLD_TO_CONFIRM_BUCKETS_SECONDS] },
    }),
    bookingEvents: meter.createCounter("bookwise_booking_events", {
      description: "Committed booking state changes, by event type",
    }),
    llmRequests: meter.createCounter("bookwise_llm_requests", {
      description: "LLM completion requests, by model, outcome and business",
    }),
    llmDuration: meter.createHistogram("bookwise_llm_request_duration_seconds", {
      description: "LLM completion latency",
      unit: "s",
      advice: { explicitBucketBoundaries: [...LATENCY_BUCKETS_SECONDS] },
    }),
    llmTokens: meter.createCounter("bookwise_llm_tokens", {
      description: "LLM tokens used, by direction, model and business",
    }),
    llmCost: meter.createCounter("bookwise_llm_cost_usd", {
      description: "Estimated LLM spend in US dollars, by model and business",
    }),
    jobRuns: meter.createCounter("bookwise_job_runs", {
      description: "Background job runs, by queue, job and outcome",
    }),
    jobDuration: meter.createHistogram("bookwise_job_duration_seconds", {
      description: "Background job run time",
      unit: "s",
      advice: { explicitBucketBoundaries: [...LATENCY_BUCKETS_SECONDS] },
    }),
    outboxPublished: meter.createCounter("bookwise_outbox_published", {
      description: "Outbox events handed to the queue",
    }),
    outboxPublishFailures: meter.createCounter("bookwise_outbox_publish_failures", {
      description: "Outbox events whose publish attempt failed",
    }),
    /** The gauge exists only in the process that relays the outbox. */
    setOldestUnpublished(seconds: number) {
      if (oldestUnpublishedSeconds === null) {
        meter
          .createObservableGauge("bookwise_outbox_oldest_unpublished_seconds", {
            description: "Age of the oldest outbox event not yet published",
            unit: "s",
          })
          .addCallback((result) => result.observe(oldestUnpublishedSeconds ?? 0));
      }

      oldestUnpublishedSeconds = seconds;
    },
  };
}

let instruments: ReturnType<typeof createInstruments> | undefined;

function get() {
  instruments ??= createInstruments();

  return instruments;
}

/** Only for tests that install a fresh meter provider. */
export function resetMetricInstruments(): void {
  instruments = undefined;
}

function llmCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const pricing = OBSERVABILITY_CONSTANTS.LLM_PRICING_USD_PER_MILLION.find((entry) =>
    model.startsWith(entry.prefix),
  );

  return pricing ? (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000 : null;
}

export const bookingMetrics = {
  attempt(outcome: BookingAttemptOutcome, attributes: { source: string; mode: string }): void {
    get().bookingAttempts.add(1, { ...attributes, outcome });

    if (outcome === "conflict") get().slotConflicts.add(1, { source: attributes.source });
  },
  holdConfirmed(heldForSeconds: number, source: string): void {
    get().holdToConfirm.record(Math.max(0, heldForSeconds), { source });
  },
  event(type: string): void {
    get().bookingEvents.add(1, { type });
  },
};

export const llmMetrics = {
  completion(input: {
    model: string;
    businessId: string | undefined;
    outcome: LlmOutcome;
    durationSeconds: number;
    inputTokens?: number;
    outputTokens?: number;
  }): void {
    const business: Attributes = { business_id: input.businessId ?? "unknown" };
    const { llmCost, llmDuration, llmRequests, llmTokens } = get();

    llmRequests.add(1, { model: input.model, outcome: input.outcome, ...business });
    llmDuration.record(input.durationSeconds, { model: input.model, outcome: input.outcome });

    if (input.inputTokens === undefined || input.outputTokens === undefined) return;

    llmTokens.add(input.inputTokens, { model: input.model, direction: "input", ...business });
    llmTokens.add(input.outputTokens, { model: input.model, direction: "output", ...business });

    const cost = llmCostUsd(input.model, input.inputTokens, input.outputTokens);

    if (cost !== null) llmCost.add(cost, { model: input.model, ...business });
  },
};

export const jobMetrics = {
  run(queue: string, job: string, outcome: JobOutcome, durationSeconds: number): void {
    get().jobRuns.add(1, { queue, job, outcome });
    get().jobDuration.record(durationSeconds, { queue, job, outcome });
  },
  outboxPublished(count: number): void {
    if (count > 0) get().outboxPublished.add(count);
  },
  outboxPublishFailed(count: number): void {
    if (count > 0) get().outboxPublishFailures.add(count);
  },
  outboxOldestUnpublished(seconds: number): void {
    get().setOldestUnpublished(seconds);
  },
};
