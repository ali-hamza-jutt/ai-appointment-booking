import { JOB_CONSTANTS } from "../../../constants/app.constants.js";
import type { TransactionClient } from "../../../infrastructure/database/prisma.js";
import type { OutboxMessage } from "../dto/outbox.dto.js";

interface OutboxRow {
  id: string;
  type: string;
  business_id: string | null;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  created_at: Date;
}

export class OutboxDal {
  /**
   * Locks the oldest unpublished events. SKIP LOCKED lets several relays run
   * side by side without handing out the same event twice.
   */
  public async claimBatch(
    transaction: TransactionClient,
    limit: number,
  ): Promise<OutboxMessage[]> {
    const rows = await transaction.$queryRaw<OutboxRow[]>`
      SELECT "id", "type", "business_id", "aggregate_type", "aggregate_id", "payload", "created_at"
      FROM "outbox_events"
      WHERE "published_at" IS NULL AND "attempts" < ${JOB_CONSTANTS.OUTBOX_MAX_ATTEMPTS}
      ORDER BY "created_at", "id"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      businessId: row.business_id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      payload:
        typeof row.payload === "object" && row.payload !== null
          ? (row.payload as Record<string, unknown>)
          : {},
      createdAt: row.created_at.toISOString(),
    }));
  }

  public async markPublished(
    transaction: TransactionClient,
    ids: string[],
    publishedAt: Date,
  ): Promise<void> {
    await transaction.outboxEvent.updateMany({
      where: { id: { in: ids } },
      data: { publishedAt },
    });
  }

  public async recordFailedAttempt(
    transaction: TransactionClient,
    ids: string[],
  ): Promise<void> {
    await transaction.outboxEvent.updateMany({
      where: { id: { in: ids } },
      data: { attempts: { increment: 1 } },
    });
  }
}

export const outboxDal = new OutboxDal();
