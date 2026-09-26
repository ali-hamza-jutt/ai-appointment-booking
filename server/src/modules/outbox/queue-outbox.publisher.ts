import type { Queue } from "bullmq";

import type { OutboxMessage, OutboxPublisher } from "./dto/outbox.dto.js";

/** Publishes events as jobs keyed by event id, so a re-publish is a no-op. */
export class QueueOutboxPublisher implements OutboxPublisher {
  public constructor(private readonly queue: Queue<OutboxMessage>) {}

  public async publish(messages: OutboxMessage[]): Promise<void> {
    await this.queue.addBulk(
      messages.map((message) => ({
        name: message.type,
        data: message,
        opts: { jobId: message.id },
      })),
    );
  }
}
