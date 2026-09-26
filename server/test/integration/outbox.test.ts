import { Queue } from "bullmq";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { JOB_CONSTANTS } from "../../src/constants/app.constants.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { QUEUE_PREFIX } from "../../src/infrastructure/queue/queues.js";
import { closeRedis, createRedisConnection, redisKey } from "../../src/infrastructure/redis/redis.js";
import { VersionedCache } from "../../src/infrastructure/redis/versioned-cache.js";
import type {
  OutboxConsumer,
  OutboxMessage,
  OutboxPublisher,
} from "../../src/modules/outbox/dto/outbox.dto.js";
import {
  ConsumerBusyError,
  OutboxConsumerRunner,
} from "../../src/modules/outbox/outbox-consumer.runner.js";
import { availabilityCacheConsumer } from "../../src/modules/outbox/outbox-consumers.js";
import { OutboxRelayService } from "../../src/modules/outbox/outbox-relay.service.js";
import { ProcessedEventStore } from "../../src/modules/outbox/processed-event.store.js";
import { QueueOutboxPublisher } from "../../src/modules/outbox/queue-outbox.publisher.js";
import { createTestUser } from "../helpers/auth.js";
import { bookSlot, createBookableSetup } from "../helpers/booking.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";
import { getTestRedis, resetRedis } from "../helpers/redis.js";

class RecordingPublisher implements OutboxPublisher {
  public readonly published: OutboxMessage[] = [];

  public constructor(private readonly delayMs = 0) {}

  public async publish(messages: OutboxMessage[]): Promise<void> {
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    this.published.push(...messages);
  }
}

function message(overrides: Partial<OutboxMessage> = {}): OutboxMessage {
  return {
    id: crypto.randomUUID(),
    type: "booking.confirmed",
    businessId: crypto.randomUUID(),
    aggregateType: "booking",
    aggregateId: crypto.randomUUID(),
    payload: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function seedOutbox(count: number): Promise<void> {
  await prisma.outboxEvent.createMany({
    data: Array.from({ length: count }, () => ({
      type: "booking.confirmed",
      aggregateType: "booking",
      aggregateId: crypto.randomUUID(),
      payload: {},
    })),
  });
}

describe("outbox relay", () => {
  beforeEach(async () => {
    await resetDatabase();
    await resetRedis();
  });
  afterAll(async () => {
    await closeRedis();
    await disconnectTestDatabase();
  });

  it("publishes booking events written in the booking transaction", async () => {
    const setup = await createBookableSetup();
    const customer = await createTestUser();
    const bookingId = await bookSlot(customer, setup, setup.at("10:00"));
    const publisher = new RecordingPublisher();

    await expect(new OutboxRelayService(publisher).drain()).resolves.toBe(2);
    expect(publisher.published.map((event) => event.type)).toEqual([
      "booking.held",
      "booking.confirmed",
    ]);
    expect(publisher.published[1]).toMatchObject({
      businessId: setup.business.id,
      aggregateId: bookingId,
      payload: { status: "CONFIRMED", previousStatus: "HELD" },
    });
    await expect(prisma.outboxEvent.count({ where: { publishedAt: null } })).resolves.toBe(0);
  });

  it("keeps events and counts attempts when publishing fails", async () => {
    await seedOutbox(3);

    const relay = new OutboxRelayService({
      publish: () => Promise.reject(new Error("queue down")),
    });

    await expect(relay.relayBatch()).resolves.toEqual({ published: 0, failed: 3 });

    const rows = await prisma.outboxEvent.findMany({ select: { attempts: true, publishedAt: true } });

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.attempts === 1 && row.publishedAt === null)).toBe(true);
  });

  it("gives up on an event after the maximum attempts", async () => {
    await seedOutbox(1);
    await prisma.outboxEvent.updateMany({
      data: { attempts: JOB_CONSTANTS.OUTBOX_MAX_ATTEMPTS },
    });

    await expect(new OutboxRelayService(new RecordingPublisher()).drain()).resolves.toBe(0);
  });

  it("never hands the same event to two relays running at once", async () => {
    await seedOutbox(30);

    const publishers = [new RecordingPublisher(50), new RecordingPublisher(50)];
    await Promise.all(
      publishers.map((publisher) => new OutboxRelayService(publisher).relayBatch(20)),
    );

    const ids = publishers.flatMap((publisher) => publisher.published.map((event) => event.id));

    expect(ids).toHaveLength(30);
    expect(new Set(ids).size).toBe(30);
  });

  it("adds each event to the queue once, however often it is published", async () => {
    const queue = new Queue<OutboxMessage>("outbox-test", {
      connection: createRedisConnection(),
      prefix: QUEUE_PREFIX,
    });
    const publisher = new QueueOutboxPublisher(queue);
    const event = message();

    try {
      await publisher.publish([event]);
      await publisher.publish([event]);

      await expect(queue.count()).resolves.toBe(1);
      await expect(queue.getJob(event.id)).resolves.toMatchObject({
        name: "booking.confirmed",
        data: event,
      });
    } finally {
      await queue.close();
    }
  });
});

describe("outbox consumers", () => {
  beforeEach(resetRedis);
  afterAll(closeRedis);

  function runnerWith(consumer: OutboxConsumer) {
    return new OutboxConsumerRunner([consumer], new ProcessedEventStore(getTestRedis()));
  }

  it("handles a redelivered event only once", async () => {
    const handle = vi.fn(() => Promise.resolve());
    const runner = runnerWith({ name: "counter", handles: () => true, handle });
    const event = message();

    await expect(runner.dispatch(event)).resolves.toEqual(["counter"]);
    await expect(runner.dispatch(event)).resolves.toEqual([]);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("retries a consumer that failed", async () => {
    const handle = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue();
    const runner = runnerWith({ name: "flaky", handles: () => true, handle });
    const event = message();

    await expect(runner.dispatch(event)).rejects.toThrow("temporary");
    await expect(runner.dispatch(event)).resolves.toEqual(["flaky"]);
    expect(handle).toHaveBeenCalledTimes(2);
  });

  it("refuses a delivery while another is still handling the event", async () => {
    const gate: { finish: (() => void) | null } = { finish: null };
    const runner = runnerWith({
      name: "slow",
      handles: () => true,
      handle: () => new Promise<void>((resolve) => (gate.finish = resolve)),
    });
    const event = message();
    const first = runner.dispatch(event);

    await vi.waitFor(() => expect(gate.finish).not.toBeNull());
    await expect(runner.dispatch(event)).rejects.toBeInstanceOf(ConsumerBusyError);

    gate.finish?.();
    await expect(first).resolves.toEqual(["slow"]);
  });

  it("skips consumers that do not handle the event type", async () => {
    const handle = vi.fn(() => Promise.resolve());
    const runner = runnerWith({ name: "other", handles: (type) => type === "payment.paid", handle });

    await expect(runner.dispatch(message())).resolves.toEqual([]);
    expect(handle).not.toHaveBeenCalled();
  });

  it("drops cached availability when a booking changes", async () => {
    const cache = new VersionedCache<{ value: number }>({ namespace: "availability", ttlSeconds: 60 });
    const businessId = crypto.randomUUID();
    let computed = 0;
    const compute = () => Promise.resolve({ value: ++computed });

    await expect(cache.getOrCompute(businessId, { day: "x" }, compute)).resolves.toEqual({ value: 1 });
    await vi.waitFor(async () => {
      await expect(cache.getOrCompute(businessId, { day: "x" }, compute)).resolves.toEqual({ value: 1 });
    });

    await availabilityCacheConsumer.handle(message({ businessId, type: "booking.cancelled" }));

    await expect(cache.getOrCompute(businessId, { day: "x" }, compute)).resolves.toEqual({ value: 2 });
    await expect(getTestRedis().get(redisKey("availability", businessId, "version"))).resolves.toBe("1");
  });
});
