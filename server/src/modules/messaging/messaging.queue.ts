import type { Queue } from "bullmq";

import { logger } from "../../config/logger.js";
import { JOB_CONSTANTS, MESSAGING_CONSTANTS } from "../../constants/app.constants.js";
import { createQueue } from "../../infrastructure/queue/queues.js";
import { getRedis } from "../../infrastructure/redis/redis.js";
import type { InboundMessageJobData, ReminderReplyJobData } from "./dto/messaging.dto.js";
import { messagingService } from "./messaging.service.js";

/**
 * Hands incoming messages to the worker, so the webhook answers Twilio at
 * once. The job id is Twilio's message id, so a redelivered webhook queues
 * nothing new.
 */
export class MessagingQueue {
  private queue: Queue<InboundMessageJobData | ReminderReplyJobData> | null = null;

  public async enqueue(data: InboundMessageJobData): Promise<void> {
    if (!getRedis()) {
      // Local development without Redis: answer in the background instead.
      logger.warn("REDIS_URL is not set; handling an incoming message without the queue");
      void messagingService.handleInbound(data).catch((error: unknown) => {
        logger.error({ err: error }, "Handling an incoming message failed");
      });
      return;
    }

    this.queue ??= createQueue<InboundMessageJobData | ReminderReplyJobData>(JOB_CONSTANTS.QUEUES.CHANNELS);
    await this.queue.add(MESSAGING_CONSTANTS.INBOUND_JOB, data, { jobId: `inbound-${data.messageSid}` });
  }

  /** A "C" to the number reminders come from; the job id keeps a redelivered webhook from doubling it. */
  public async enqueueReminderReply(data: ReminderReplyJobData): Promise<void> {
    if (!getRedis()) {
      void messagingService.handleReminderReply(data).catch((error: unknown) => {
        logger.error({ err: error }, "Handling a reminder reply failed");
      });
      return;
    }

    this.queue ??= createQueue<InboundMessageJobData | ReminderReplyJobData>(JOB_CONSTANTS.QUEUES.CHANNELS);
    await this.queue.add(MESSAGING_CONSTANTS.REMINDER_REPLY_JOB, data, {
      jobId: `reminder-reply-${data.messageSid}`,
    });
  }

  public async close(): Promise<void> {
    await this.queue?.close();
    this.queue = null;
  }
}

export const messagingQueue = new MessagingQueue();
