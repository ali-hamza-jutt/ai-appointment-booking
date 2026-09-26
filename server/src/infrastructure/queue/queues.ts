import { Queue, type JobsOptions } from "bullmq";

import { JOB_CONSTANTS } from "../../constants/app.constants.js";
import { createRedisConnection, redisKey } from "../redis/redis.js";

/** Retries with exponential backoff and bounded job history. */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: JOB_CONSTANTS.JOB_ATTEMPTS,
  backoff: { type: "exponential", delay: JOB_CONSTANTS.JOB_BACKOFF_MS },
  removeOnComplete: { count: JOB_CONSTANTS.KEEP_COMPLETED_JOBS },
  removeOnFail: { count: JOB_CONSTANTS.KEEP_FAILED_JOBS },
};

/** BullMQ key prefix, shared by queues and workers so they see the same jobs. */
export const QUEUE_PREFIX = redisKey("queue");

export function createQueue<Data>(name: string): Queue<Data> {
  return new Queue<Data>(name, {
    connection: createRedisConnection(),
    prefix: QUEUE_PREFIX,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
}
