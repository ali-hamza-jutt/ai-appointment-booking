import { logger } from "../../config/logger.js";
import { JOB_CONSTANTS } from "../../constants/app.constants.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { jobMetrics } from "../../infrastructure/observability/metrics.js";
import { outboxDal } from "./dal/outbox.dal.js";
import type { OutboxPublisher, RelayBatchResult } from "./dto/outbox.dto.js";

/**
 * Moves committed outbox rows onto the queue. Rows stay locked until the
 * publish finishes, so a crash before commit only causes a re-publish,
 * which the queue (job id = event id) and consumers both absorb.
 */
export class OutboxRelayService {
  public constructor(private readonly publisher: OutboxPublisher) {}

  public async relayBatch(
    limit: number = JOB_CONSTANTS.OUTBOX_BATCH_SIZE,
  ): Promise<RelayBatchResult> {
    const result = await this.relayInTransaction(limit);

    jobMetrics.outboxPublished(result.published);
    jobMetrics.outboxPublishFailed(result.failed);

    return result;
  }

  private relayInTransaction(limit: number): Promise<RelayBatchResult> {
    return prisma.$transaction(async (transaction) => {
      const messages = await outboxDal.claimBatch(transaction, limit);

      if (messages.length === 0) return { published: 0, failed: 0 };

      const ids = messages.map((message) => message.id);

      try {
        await this.publisher.publish(messages);
      } catch (error) {
        logger.warn({ err: error, count: ids.length }, "Outbox publish failed");
        await outboxDal.recordFailedAttempt(transaction, ids);

        return { published: 0, failed: ids.length };
      }

      await outboxDal.markPublished(transaction, ids, new Date());

      return { published: ids.length, failed: 0 };
    });
  }

  /** Relays until the backlog is empty or a batch fails, then reports what is left. */
  public async drain(): Promise<number> {
    let total = 0;

    for (;;) {
      const result = await this.relayBatch();

      total += result.published;

      if (result.failed > 0 || result.published < JOB_CONSTANTS.OUTBOX_BATCH_SIZE) break;
    }

    const oldest = await outboxDal.oldestUnpublishedAt();

    jobMetrics.outboxOldestUnpublished(oldest ? (Date.now() - oldest.getTime()) / 1_000 : 0);

    return total;
  }
}
