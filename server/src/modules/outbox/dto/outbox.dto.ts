/** An outbox row as it travels through the queue. */
export interface OutboxMessage {
  id: string;
  type: string;
  businessId: string | null;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** Hands claimed events to the queue; must be safe to call twice for one event. */
export interface OutboxPublisher {
  publish(messages: OutboxMessage[]): Promise<void>;
}

/**
 * Reacts to published events. Handlers run at least once per event, so they
 * must tolerate a repeat; the runner skips events a consumer already finished.
 */
export interface OutboxConsumer {
  name: string;
  handles(type: string): boolean;
  handle(message: OutboxMessage): Promise<void>;
}

export interface RelayBatchResult {
  published: number;
  failed: number;
}
