import { beforeAll, describe, expect, it } from "vitest";

import type {
  AiProvider,
  AiProviderCompletionRequest,
  AiProviderCompletionResponse,
} from "../../src/integrations/ai/dto/ai.dto.js";
import { AiProviderError } from "../../src/integrations/ai/errors/ai-provider.error.js";
import { InstrumentedAiProvider } from "../../src/integrations/ai/providers/instrumented.provider.js";
import { bookingMetrics } from "../../src/infrastructure/observability/metrics.js";
import {
  getRequestId,
  runWithRequestId,
} from "../../src/infrastructure/observability/request-context.js";
import { currentOutboxMeta, readOutboxMeta } from "../../src/modules/outbox/outbox-meta.js";
import { installTestMeter } from "../helpers/metrics.js";

class FakeProvider implements AiProvider {
  public readonly name = "mistral" as const;
  public readonly model = "mistral-small-latest";

  public constructor(private readonly outcome: "ok" | "fail") {}

  public completeJson(_request: AiProviderCompletionRequest): Promise<AiProviderCompletionResponse> {
    if (this.outcome === "fail") return Promise.reject(new AiProviderError("TIMEOUT", "timed out"));

    return Promise.resolve({
      content: "{}",
      provider: "mistral",
      model: "mistral-small-2506",
      usage: { promptTokens: 1_000, completionTokens: 200, totalTokens: 1_200 },
    });
  }
}

const REQUEST = { systemPrompt: "s", messages: [], maxOutputTokens: 100, temperature: 0 };

describe("observability", () => {
  let meter: ReturnType<typeof installTestMeter>;

  beforeAll(() => {
    meter = installTestMeter();
  });

  it("records LLM tokens, latency and estimated cost per business", async () => {
    await new InstrumentedAiProvider(new FakeProvider("ok")).completeJson({ ...REQUEST, businessId: "biz-1" });

    const business = { business_id: "biz-1", model: "mistral-small-2506" };

    await expect(meter.total("bookwise_llm_requests", { ...business, outcome: "success" })).resolves.toBe(1);
    await expect(meter.total("bookwise_llm_tokens", { ...business, direction: "input" })).resolves.toBe(1_000);
    await expect(meter.total("bookwise_llm_tokens", { ...business, direction: "output" })).resolves.toBe(200);
    // 1,000 input at $0.10/M plus 200 output at $0.30/M.
    await expect(meter.total("bookwise_llm_cost_usd", business)).resolves.toBeCloseTo(0.00016, 8);
    await expect(meter.points("bookwise_llm_request_duration_seconds")).resolves.toHaveLength(1);
  });

  it("counts failed LLM calls without inventing usage", async () => {
    await expect(
      new InstrumentedAiProvider(new FakeProvider("fail")).completeJson({ ...REQUEST, businessId: "biz-2" }),
    ).rejects.toThrow("timed out");

    await expect(meter.total("bookwise_llm_requests", { business_id: "biz-2", outcome: "error" })).resolves.toBe(1);
    await expect(meter.total("bookwise_llm_tokens", { business_id: "biz-2" })).resolves.toBe(0);
  });

  it("splits booking attempts by outcome and counts conflicts", async () => {
    const labels = { source: "FORM", mode: "CUSTOMER" };

    bookingMetrics.attempt("held", labels);
    bookingMetrics.attempt("conflict", labels);
    bookingMetrics.holdConfirmed(42, "FORM");

    await expect(meter.total("bookwise_booking_attempts", { outcome: "held" })).resolves.toBe(1);
    await expect(meter.total("bookwise_booking_slot_conflicts", { source: "FORM" })).resolves.toBe(1);
    await expect(meter.points("bookwise_booking_hold_to_confirm_seconds")).resolves.toHaveLength(1);
  });

  it("carries the request id from a request into outbox events", () => {
    const meta = runWithRequestId("req-123", () => currentOutboxMeta());

    expect(meta.requestId).toBe("req-123");
    expect(readOutboxMeta({ meta })).toEqual(meta);
    expect(readOutboxMeta({})).toEqual({ requestId: null, trace: {} });
    expect(getRequestId()).toBeUndefined();
  });
});
