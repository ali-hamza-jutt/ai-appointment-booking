import { availabilityCache } from "../availability/availability-cache.js";
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

/** Every consumer the worker runs, in dispatch order. */
export const outboxConsumers: readonly OutboxConsumer[] = [availabilityCacheConsumer];
