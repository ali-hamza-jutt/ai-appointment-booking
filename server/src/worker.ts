import { Worker, type Job } from "bullmq";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { JOB_CONSTANTS } from "./constants/app.constants.js";
import {
  connectDatabase,
  disconnectDatabase,
} from "./infrastructure/database/prisma.js";
import { flushErrorReporting, reportError } from "./infrastructure/observability/error-reporting.js";
import { jobMetrics } from "./infrastructure/observability/metrics.js";
import { runWithRequestId } from "./infrastructure/observability/request-context.js";
import { stopTelemetry } from "./infrastructure/observability/telemetry.js";
import { withSpan, withTraceContext } from "./infrastructure/observability/tracing.js";
import { createQueue, QUEUE_PREFIX } from "./infrastructure/queue/queues.js";
import {
  closeRedis,
  createRedisConnection,
  getRedis,
} from "./infrastructure/redis/redis.js";
import { bookingMaintenanceService } from "./modules/bookings/booking-maintenance.service.js";
import type { OutboxMessage } from "./modules/outbox/dto/outbox.dto.js";
import { OutboxConsumerRunner } from "./modules/outbox/outbox-consumer.runner.js";
import { outboxConsumers } from "./modules/outbox/outbox-consumers.js";
import { readOutboxMeta } from "./modules/outbox/outbox-meta.js";
import { OutboxRelayService } from "./modules/outbox/outbox-relay.service.js";
import { ProcessedEventStore } from "./modules/outbox/processed-event.store.js";
import { QueueOutboxPublisher } from "./modules/outbox/queue-outbox.publisher.js";

const { QUEUES, MAINTENANCE_JOBS } = JOB_CONSTANTS;

type MaintenanceJobName = (typeof MAINTENANCE_JOBS)[keyof typeof MAINTENANCE_JOBS];

const MAINTENANCE_SCHEDULE: Record<MaintenanceJobName, number> = {
  [MAINTENANCE_JOBS.EXPIRE_HOLDS]: JOB_CONSTANTS.EXPIRE_HOLDS_EVERY_MS,
  [MAINTENANCE_JOBS.MARK_NO_SHOWS]: JOB_CONSTANTS.MARK_NO_SHOWS_EVERY_MS,
  [MAINTENANCE_JOBS.COMPLETE_VISITS]: JOB_CONSTANTS.COMPLETE_VISITS_EVERY_MS,
};

const MAINTENANCE_TASKS: Record<MaintenanceJobName, () => Promise<number>> = {
  [MAINTENANCE_JOBS.EXPIRE_HOLDS]: () => bookingMaintenanceService.expireLapsedHolds(),
  [MAINTENANCE_JOBS.MARK_NO_SHOWS]: () => bookingMaintenanceService.markNoShows(),
  [MAINTENANCE_JOBS.COMPLETE_VISITS]: () => bookingMaintenanceService.completeFinishedVisits(),
};

let relayTimer: NodeJS.Timeout | undefined;
let relayRunning: Promise<unknown> | undefined;
const workers: Worker[] = [];
let isShuttingDown = false;

function isMaintenanceJob(name: string): name is MaintenanceJobName {
  return name in MAINTENANCE_TASKS;
}

/** Runs a job in its own span and records its duration and outcome. */
async function observeJob<Result>(queue: string, job: Job, work: () => Promise<Result>): Promise<Result> {
  const startedAt = performance.now();
  const seconds = () => (performance.now() - startedAt) / 1_000;

  try {
    const result = await withSpan(
      `job ${queue}/${job.name}`,
      { "messaging.system": "bullmq", "messaging.destination.name": queue, "job.id": job.id ?? "" },
      work,
    );

    jobMetrics.run(queue, job.name, "success", seconds());

    return result;
  } catch (error) {
    jobMetrics.run(queue, job.name, "error", seconds());
    // Only the last attempt is worth an alert; earlier ones are retried.
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) reportError(error, { queue, job: job.name });
    throw error;
  }
}

async function runMaintenanceJob(job: Job): Promise<number> {
  if (!isMaintenanceJob(job.name)) {
    throw new Error(`Unknown maintenance job ${job.name}`);
  }

  const changed = await observeJob(QUEUES.MAINTENANCE, job, MAINTENANCE_TASKS[job.name]);

  if (changed > 0) logger.info({ job: job.name, changed }, "Booking maintenance applied");

  return changed;
}

/** Continues the trace and request id of the request that wrote the event. */
function runOutboxJob(runner: OutboxConsumerRunner, job: Job<OutboxMessage>): Promise<string[]> {
  const message = job.data;
  const meta = readOutboxMeta(message.payload);

  return withTraceContext(meta.trace, () =>
    runWithRequestId(meta.requestId ?? message.id, () =>
      observeJob(QUEUES.OUTBOX, job, () => runner.dispatch(message)),
    ),
  );
}

function startRelay(relay: OutboxRelayService): void {
  const tick = () => {
    relayRunning = relay
      .drain()
      .catch((error: unknown) => {
        logger.error({ err: error }, "Outbox relay failed");
      })
      .finally(() => {
        if (!isShuttingDown) relayTimer = setTimeout(tick, env.OUTBOX_RELAY_INTERVAL_MS);
      });
  };

  tick();
}

function watch(worker: Worker): Worker {
  worker.on("failed", (job, error) => {
    logger.warn(
      { err: error, queue: worker.name, job: job?.name, jobId: job?.id, attempt: job?.attemptsMade },
      "Job failed",
    );
  });
  worker.on("error", (error) => {
    logger.error({ err: error, queue: worker.name }, "Worker error");
  });
  workers.push(worker);

  return worker;
}

async function startWorker(): Promise<void> {
  const redis = getRedis();

  if (!redis) {
    logger.fatal("REDIS_URL is required to run the worker");
    process.exitCode = 1;
    return;
  }

  try {
    await connectDatabase();

    const outboxQueue = createQueue<OutboxMessage>(QUEUES.OUTBOX);
    const maintenanceQueue = createQueue(QUEUES.MAINTENANCE);
    const runner = new OutboxConsumerRunner(outboxConsumers, new ProcessedEventStore(redis));

    for (const [name, every] of Object.entries(MAINTENANCE_SCHEDULE)) {
      await maintenanceQueue.upsertJobScheduler(name, { every }, { name });
    }

    watch(
      new Worker<OutboxMessage>(QUEUES.OUTBOX, (job) => runOutboxJob(runner, job), {
        connection: createRedisConnection(),
        prefix: QUEUE_PREFIX,
      }),
    );
    watch(
      new Worker(QUEUES.MAINTENANCE, runMaintenanceJob, {
        connection: createRedisConnection(),
        prefix: QUEUE_PREFIX,
        concurrency: 1,
      }),
    );
    startRelay(new OutboxRelayService(new QueueOutboxPublisher(outboxQueue)));

    logger.info({ environment: env.NODE_ENV }, "BookWise worker started");
  } catch (error) {
    logger.fatal({ err: error }, "Failed to start BookWise worker");
    await shutdown(1);
  }
}

async function shutdown(exitCode = 0): Promise<void> {
  process.exitCode = Math.max(Number(process.exitCode ?? 0), exitCode);

  if (isShuttingDown) return;

  isShuttingDown = true;
  logger.info("Worker shutdown started");

  const forceShutdownTimer = setTimeout(() => {
    logger.fatal("Worker shutdown timed out");
    process.exit(1);
  }, 15_000);

  forceShutdownTimer.unref();

  try {
    clearTimeout(relayTimer);
    await relayRunning;
    await Promise.all(workers.map((worker) => worker.close()));
    await closeRedis();
    await disconnectDatabase();
    await Promise.allSettled([stopTelemetry(), flushErrorReporting()]);
    logger.info("BookWise worker stopped");
  } catch (error) {
    logger.error({ err: error }, "Worker shutdown failed");
    process.exitCode = 1;
  } finally {
    clearTimeout(forceShutdownTimer);
  }
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled promise rejection");
  reportError(reason);
  void shutdown(1);
});

void startWorker();
