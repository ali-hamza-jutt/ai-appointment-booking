import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../infrastructure/database/prisma.js";

const RECENT_MESSAGES = 6;

const handoffSelect = {
  id: true,
  handoffReason: true,
  handoffRequestedAt: true,
  handoffResolvedAt: true,
  user: { select: { fullName: true, email: true, phone: true } },
  messages: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: RECENT_MESSAGES,
    select: { role: true, content: true, createdAt: true },
  },
} satisfies Prisma.ChatSessionSelect;

export class ChatHandoffDal {
  public listOpen(businessId: string, take: number) {
    return prisma.chatSession.findMany({
      where: { businessId, handoffRequestedAt: { not: null }, handoffResolvedAt: null },
      orderBy: [{ handoffRequestedAt: "asc" }, { id: "asc" }],
      take,
      select: handoffSelect,
    });
  }

  /** Marks one of this business's handoffs resolved; false if there is none. */
  public async resolve(businessId: string, sessionId: string, resolvedAt: Date): Promise<boolean> {
    const result = await prisma.chatSession.updateMany({
      where: { id: sessionId, businessId, handoffRequestedAt: { not: null }, handoffResolvedAt: null },
      data: { handoffResolvedAt: resolvedAt },
    });

    return result.count === 1;
  }
}

export const chatHandoffDal = new ChatHandoffDal();
