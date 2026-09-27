import type { Queue } from "bullmq";

import { logger } from "../../config/logger.js";
import { CALENDAR_CONSTANTS, JOB_CONSTANTS } from "../../constants/app.constants.js";
import { createQueue } from "../../infrastructure/queue/queues.js";
import { getRedis } from "../../infrastructure/redis/redis.js";
import type { CalendarSyncJobData } from "./dto/calendar.dto.js";

/** Asks the worker to sync one calendar. Syncing is idempotent, so extra requests only cost an API call. */
export class CalendarSyncQueue {
  private queue: Queue<CalendarSyncJobData> | null = null;

  public async enqueue(data: CalendarSyncJobData, delayMs = 0): Promise<void> {
    if (!getRedis()) {
      logger.warn({ connectionId: data.connectionId }, "Calendar sync not queued: REDIS_URL is not set");
      return;
    }

    this.queue ??= createQueue<CalendarSyncJobData>(JOB_CONSTANTS.QUEUES.CALENDAR);
    await this.queue.add(CALENDAR_CONSTANTS.SYNC_JOB, data, { delay: delayMs });
  }

  public async close(): Promise<void> {
    await this.queue?.close();
    this.queue = null;
  }
}

export const calendarSyncQueue = new CalendarSyncQueue();
