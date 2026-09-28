import type { Prisma } from "../../../generated/prisma/client.js";
import { logger } from "../../../config/logger.js";
import { prisma } from "../../../infrastructure/database/prisma.js";

export interface AdminAuditEntry {
  adminId: string;
  /** For example impersonation.start, business.suspend or job.retry. */
  action: string;
  targetType: "business" | "user" | "job" | "outbox_event";
  targetId: string | null;
  details?: Record<string, unknown>;
}

/** The record of what platform admins did. */
export class AdminAuditDal {
  public async record(entry: AdminAuditEntry): Promise<void> {
    await prisma.adminAuditLog.create({
      data: {
        adminId: entry.adminId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        ...(entry.details ? { details: entry.details as Prisma.InputJsonObject } : {}),
      },
    });
  }

  /** For per-request entries, which shouldn't slow or fail the request itself. */
  public recordInBackground(entry: AdminAuditEntry): void {
    void this.record(entry).catch((error: unknown) => {
      logger.error({ err: error, action: entry.action }, "Writing the admin audit log failed");
    });
  }

  public list(limit: number) {
    return prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        details: true,
        createdAt: true,
        admin: { select: { id: true, fullName: true, email: true } },
      },
    });
  }
}

export const adminAuditDal = new AdminAuditDal();
