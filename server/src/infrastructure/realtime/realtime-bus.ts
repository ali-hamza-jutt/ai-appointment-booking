import { EventEmitter } from "node:events";

import type { Redis } from "ioredis";

import { logger } from "../../config/logger.js";
import { createRedisConnection, getRedis, isRedisConfigured, redisKey } from "../redis/redis.js";

export type RealtimeListener = (payload: unknown) => void;
export type Unsubscribe = () => Promise<void>;

/**
 * Fan-out of small JSON events to whoever is listening. Delivery is best
 * effort: listeners use events as a hint to refetch, never as the record.
 */
export interface RealtimeBus {
  publish(channel: string, payload: unknown): Promise<void>;
  subscribe(channel: string, listener: RealtimeListener): Promise<Unsubscribe>;
  close(): Promise<void>;
}

/** Single-process bus, used when Redis isn't configured (and in tests). */
export class LocalRealtimeBus implements RealtimeBus {
  private readonly emitter = new EventEmitter().setMaxListeners(0);

  public publish(channel: string, payload: unknown): Promise<void> {
    this.emitter.emit(channel, payload);

    return Promise.resolve();
  }

  public subscribe(channel: string, listener: RealtimeListener): Promise<Unsubscribe> {
    this.emitter.on(channel, listener);

    return Promise.resolve(() => {
      this.emitter.off(channel, listener);
      return Promise.resolve();
    });
  }

  public close(): Promise<void> {
    this.emitter.removeAllListeners();

    return Promise.resolve();
  }
}

/**
 * Redis pub/sub, so every API instance sees every event. One subscriber
 * connection is shared by all listeners in the process.
 */
export class RedisRealtimeBus implements RealtimeBus {
  private subscriber: Redis | null = null;
  private readonly listeners = new Map<string, Set<RealtimeListener>>();

  public async publish(channel: string, payload: unknown): Promise<void> {
    await getRedis()?.publish(redisKey("realtime", channel), JSON.stringify(payload));
  }

  public async subscribe(channel: string, listener: RealtimeListener): Promise<Unsubscribe> {
    const key = redisKey("realtime", channel);
    const existing = this.listeners.get(key);

    if (existing) {
      existing.add(listener);
    } else {
      this.listeners.set(key, new Set([listener]));
      await this.connection().subscribe(key);
    }

    return async () => {
      const set = this.listeners.get(key);

      if (!set?.delete(listener) || set.size > 0) return;

      this.listeners.delete(key);
      await this.subscriber?.unsubscribe(key).catch((error: unknown) => {
        logger.warn({ err: error }, "Realtime unsubscribe failed");
      });
    };
  }

  public async close(): Promise<void> {
    this.listeners.clear();
    await this.subscriber?.quit().catch(() => undefined);
    this.subscriber = null;
  }

  private connection(): Redis {
    if (this.subscriber) return this.subscriber;

    this.subscriber = createRedisConnection();
    this.subscriber.on("message", (key: string, message: string) => {
      let payload: unknown;

      try {
        payload = JSON.parse(message);
      } catch {
        return;
      }

      for (const listener of this.listeners.get(key) ?? []) listener(payload);
    });

    return this.subscriber;
  }
}

export const realtimeBus: RealtimeBus = isRedisConfigured() ? new RedisRealtimeBus() : new LocalRealtimeBus();
