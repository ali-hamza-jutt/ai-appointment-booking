import { bookingMetrics } from "../../infrastructure/observability/metrics.js";
import { KNOWLEDGE_CONSTANTS } from "../../constants/app.constants.js";
import { availabilityCache } from "../availability/availability-cache.js";
import { knowledgeService } from "../knowledge/knowledge.service.js";
import type { OutboxConsumer } from "./dto/outbox.dto.js";

const BOOKING_EVENT_PREFIX = "booking.";

/** Any booking change can open or close a slot for its business. */
export const availabilityCacheConsumer: OutboxConsumer = {
  name: "availability-cache",
  handles: (type) => type.startsWith(BOOKING_EVENT_PREFIX),
  async handle(message) {
    if (message.businessId) await availabilityCache.invalidate(message.businessId);
  },
};

/** Counts committed booking changes; running once per event keeps the counts exact. */
export const bookingMetricsConsumer: OutboxConsumer = {
  name: "booking-metrics",
  handles: (type) => type.startsWith(BOOKING_EVENT_PREFIX),
  handle(message) {
    bookingMetrics.event(message.type);

    return Promise.resolve();
  },
};

/** Re-embeds a knowledge source after it changes; stale hashes are skipped. */
export const knowledgeIndexConsumer: OutboxConsumer = {
  name: "knowledge-index",
  handles: (type) => type === KNOWLEDGE_CONSTANTS.SOURCE_CHANGED_EVENT,
  async handle(message) {
    const { businessId, sourceId, contentHash } = message.payload;

    if (typeof businessId !== "string" || typeof sourceId !== "string" || typeof contentHash !== "string") {
      return;
    }

    await knowledgeService.indexSource(businessId, sourceId, contentHash);
  },
};

/** Every consumer the worker runs, in dispatch order. */
export const outboxConsumers: readonly OutboxConsumer[] = [
  availabilityCacheConsumer,
  bookingMetricsConsumer,
  knowledgeIndexConsumer,
];
