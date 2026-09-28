import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../infrastructure/database/prisma.js";

const RECENT_MESSAGES = 6;

const messageSelect = {
  id: true,
  role: true,
  content: true,
  structuredData: true,
  createdAt: true,
} satisfies Prisma.ChatMessageSelect;

const handoffSelect = {
  id: true,
  userId: true,
  channel: true,
  customerAddress: true,
  businessAddress: true,
  business: { select: { name: true } },
  handoffReason: true,
  handoffRequestedAt: true,
  handoffResolvedAt: true,
  user: { select: { fullName: true, email: true, phone: true } },
  messages: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: RECENT_MESSAGES,
    select: messageSelect,
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

  /** One of the business's chats that was handed to staff, open or resolved, with its latest messages. */
  public findHandedOff(businessId: string, sessionId: string, messageCount: number) {
    return prisma.chatSession.findFirst({
      where: { id: sessionId, businessId, handoffRequestedAt: { not: null } },
      select: {
        ...handoffSelect,
        messages: { ...handoffSelect.messages, take: messageCount },
      },
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

  public async findUserName(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });

    return user?.fullName ?? null;
  }
}

export const chatHandoffDal = new ChatHandoffDal();
