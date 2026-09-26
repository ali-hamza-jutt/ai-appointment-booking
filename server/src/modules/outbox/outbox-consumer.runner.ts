import type { OutboxConsumer, OutboxMessage } from "./dto/outbox.dto.js";
import type { ProcessedEventStore } from "./processed-event.store.js";

export class ConsumerBusyError extends Error {
  public constructor(consumer: string, eventId: string) {
    super(`${consumer} is already handling event ${eventId}`);
    this.name = "ConsumerBusyError";
  }
}

/**
 * Delivers one event to every interested consumer, at most once each.
 * A failing consumer is released and rethrown so the queue retries the
 * job; consumers that already finished are skipped on the retry.
 */
export class OutboxConsumerRunner {
  public constructor(
    private readonly consumers: readonly OutboxConsumer[],
    private readonly store: ProcessedEventStore,
  ) {}

  public async dispatch(message: OutboxMessage): Promise<string[]> {
    const handledBy: string[] = [];

    for (const consumer of this.consumers) {
      if (!consumer.handles(message.type)) continue;

      const claim = await this.store.claim(consumer.name, message.id);

      if (claim === "done") continue;
      if (claim === "busy") throw new ConsumerBusyError(consumer.name, message.id);

      try {
        await consumer.handle(message);
      } catch (error) {
        await this.store.release(consumer.name, message.id);
        throw error;
      }

      await this.store.complete(consumer.name, message.id);
      handledBy.push(consumer.name);
    }

    return handledBy;
  }
}
