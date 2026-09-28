import { prisma } from "../../../infrastructure/database/prisma.js";

const DAY = 24 * 60 * 60 * 1_000;

function businessSelect(since: Date) {
  return {
    id: true,
    name: true,
    slug: true,
    createdAt: true,
    suspendedAt: true,
    suspendedReason: true,
    memberships: {
      orderBy: { createdAt: "asc" },
      select: { role: true, user: { select: { id: true, fullName: true, email: true } } },
    },
    _count: { select: { bookings: { where: { createdAt: { gte: since } } } } },
  } as const;
}

export class AdminDal {
  public listBusinesses(search: string | undefined, limit: number, now: Date) {
    return prisma.business.findMany({
      where: search
        ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { slug: { contains: search, mode: "insensitive" } }] }
        : {},
      orderBy: { createdAt: "desc" },
      take: limit,
      select: businessSelect(new Date(now.getTime() - 30 * DAY)),
    });
  }

  public findBusiness(businessId: string, now: Date) {
    return prisma.business.findUnique({ where: { id: businessId }, select: businessSelect(new Date(now.getTime() - 30 * DAY)) });
  }

  public async setSuspended(businessId: string, suspended: { at: Date; reason: string } | null): Promise<boolean> {
    const result = await prisma.business.updateMany({
      where: { id: businessId },
      data: suspended ? { suspendedAt: suspended.at, suspendedReason: suspended.reason } : { suspendedAt: null, suspendedReason: null },
    });

    return result.count === 1;
  }

  /** Model spend per business over the days since `since`. */
  public async costByBusiness(businessIds: string[], since: string): Promise<Map<string, number>> {
    if (businessIds.length === 0) return new Map();

    const rows = await prisma.llmUsage.groupBy({
      by: ["businessId"],
      where: { businessId: { in: businessIds }, date: { gte: new Date(`${since}T00:00:00Z`) } },
      _sum: { costUsd: true },
    });

    return new Map(rows.map((row) => [row.businessId, row._sum.costUsd ?? 0]));
  }

  public listUsage(businessId: string, since: string) {
    return prisma.llmUsage.findMany({
      where: { businessId, date: { gte: new Date(`${since}T00:00:00Z`) } },
      orderBy: [{ date: "asc" }, { model: "asc" }],
      select: { date: true, model: true, requests: true, inputTokens: true, outputTokens: true, costUsd: true },
    });
  }

  public listUsers(search: string | undefined, limit: number) {
    return prisma.user.findMany({
      where: search
        ? { OR: [{ email: { contains: search, mode: "insensitive" } }, { fullName: { contains: search, mode: "insensitive" } }] }
        : {},
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, email: true, fullName: true, platformRole: true, createdAt: true },
    });
  }

  public listDeadOutboxEvents(maxAttempts: number, limit: number) {
    return prisma.outboxEvent.findMany({
      where: { publishedAt: null, attempts: { gte: maxAttempts } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, type: true, businessId: true, attempts: true, createdAt: true },
    });
  }

  /** Puts a given-up event back in line for the relay; false if it isn't a given-up event. */
  public async replayOutboxEvent(eventId: string, maxAttempts: number): Promise<boolean> {
    const result = await prisma.outboxEvent.updateMany({
      where: { id: eventId, publishedAt: null, attempts: { gte: maxAttempts } },
      data: { attempts: 0 },
    });

    return result.count === 1;
  }
}

export const adminDal = new AdminDal();
