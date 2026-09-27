import { randomUUID } from "node:crypto";

import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../infrastructure/database/prisma.js";
import type {
  ChatDraftPatch,
  ChatMemoryState,
  ChatMessageRecord,
  ChatSessionRecord,
  ChatSessionWithMessagesRecord,
  CreateChatMessageData,
  CreateChatSessionData,
  ListChatMessageRangeData,
  ListChatMessagesData,
  ListRecentChatMessagesData,
  ListChatSessionsData,
  SaveAssistantTurnData,
  SaveChatSummaryData,
  UpdateChatDraftData,
} from "../dto/chat.dto.js";

export const chatSessionSelect = {
  id: true,
  business: { select: { id: true, name: true, slug: true } },
  title: true,
  status: true,
  draftService: {
    select: { id: true, name: true, durationMinutes: true, priceMinor: true, currency: true },
  },
  draftStaff: { select: { id: true, displayName: true } },
  draftHold: {
    select: {
      id: true,
      serviceName: true,
      scheduledAt: true,
      endsAt: true,
      durationMinutes: true,
      priceMinor: true,
      currency: true,
      status: true,
      holdExpiresAt: true,
      timeZone: true,
      staff: { select: { displayName: true } },
    },
  },
  draftTimeZone: true,
  draftNotes: true,
  handoffRequestedAt: true,
  handoffReason: true,
  handoffResolvedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Column updates for a draft patch; undefined fields are left as they are. */
function draftColumns(draft: ChatDraftPatch | undefined): Prisma.ChatSessionUncheckedUpdateInput {
  if (!draft) return {};

  return {
    ...(draft.serviceId !== undefined ? { draftServiceId: draft.serviceId } : {}),
    ...(draft.staffId !== undefined ? { draftStaffId: draft.staffId } : {}),
    ...(draft.holdId !== undefined ? { draftHoldId: draft.holdId } : {}),
    ...(draft.timeZone !== undefined ? { draftTimeZone: draft.timeZone } : {}),
    ...(draft.notes !== undefined ? { draftNotes: draft.notes } : {}),
  };
}

export const chatMessageSelect = {
  id: true,
  sessionId: true,
  clientMessageId: true,
  replyToMessageId: true,
  role: true,
  content: true,
  structuredData: true,
  createdAt: true,
} as const;

export class ChatDal {
  public createSession(data: CreateChatSessionData): Promise<ChatSessionRecord> {
    return prisma.$transaction(async (transaction) => {
      // One chat is active per customer per business; other businesses' chats stay open.
      if (data.replaceActive) {
        await transaction.chatSession.updateMany({
          where: { userId: data.userId, businessId: data.businessId, status: "ACTIVE" },
          data: { status: "ABANDONED" },
        });
      } else {
        const activeSession = await transaction.chatSession.findFirst({
          where: { userId: data.userId, businessId: data.businessId, status: "ACTIVE" },
          select: chatSessionSelect,
        });

        if (activeSession) {
          return activeSession;
        }
      }

      return transaction.chatSession.create({
        data: {
          businessId: data.businessId,
          userId: data.userId,
          title: data.title,
        },
        select: chatSessionSelect,
      });
    });
  }

  public findActiveSessionForUser(
    userId: string,
    businessId: string,
  ): Promise<ChatSessionRecord | null> {
    return prisma.chatSession.findFirst({
      where: { userId, businessId, status: "ACTIVE" },
      select: chatSessionSelect,
    });
  }

  public findSessionForUser(
    sessionId: string,
    userId: string,
  ): Promise<ChatSessionRecord | null> {
    return prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      select: chatSessionSelect,
    });
  }

  public listSessions(
    data: ListChatSessionsData,
  ): Promise<ChatSessionRecord[]> {
    return prisma.chatSession.findMany({
      where: {
        userId: data.userId,
        ...(data.status ? { status: data.status } : {}),
        ...(data.businessSlug ? { business: { slug: data.businessSlug } } : {}),
        ...(data.cursor
          ? {
              OR: [
                { updatedAt: { lt: data.cursor.updatedAt } },
                {
                  updatedAt: data.cursor.updatedAt,
                  id: { lt: data.cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: data.take,
      select: chatSessionSelect,
    });
  }

  public async createMessage(
    data: CreateChatMessageData,
  ): Promise<ChatMessageRecord> {
    const messageId = randomUUID();
    const session = await prisma.chatSession.update({
      where: {
        id: data.sessionId,
        userId: data.userId,
        status: "ACTIVE",
      },
      data: {
        updatedAt: new Date(),
        messages: {
          create: {
            id: messageId,
            clientMessageId: data.clientMessageId,
            replyToMessageId: data.replyToMessageId,
            role: data.role,
            content: data.content,
            ...(data.structuredData
              ? {
                  structuredData:
                    data.structuredData as unknown as Prisma.InputJsonObject,
                }
              : {}),
          },
        },
      },
      select: {
        messages: {
          where: { id: messageId },
          select: chatMessageSelect,
        },
      },
    });
    const message = session.messages[0];

    if (!message) {
      throw new Error("Created chat message was not returned");
    }

    return message;
  }

  public async listMessagesForSession(
    data: ListChatMessagesData,
  ): Promise<ChatMessageRecord[] | null> {
    const session = await prisma.chatSession.findFirst({
      where: {
        id: data.sessionId,
        userId: data.userId,
      },
      select: {
        messages: {
          ...(data.cursor
            ? {
                where: {
                  OR: [
                    { createdAt: { gt: data.cursor.createdAt } },
                    {
                      createdAt: data.cursor.createdAt,
                      id: { gt: data.cursor.id },
                    },
                  ],
                },
              }
            : {}),
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: data.take,
          select: chatMessageSelect,
        },
      },
    });

    return session?.messages ?? null;
  }

  public findMessageByClientIdForUser(
    sessionId: string,
    userId: string,
    clientMessageId: string,
  ): Promise<ChatMessageRecord | null> {
    return prisma.chatMessage.findFirst({
      where: {
        sessionId,
        clientMessageId,
        session: { userId },
      },
      select: chatMessageSelect,
    });
  }

  public findAssistantReplyForUserMessage(
    sessionId: string,
    userId: string,
    replyToMessageId: string,
  ): Promise<ChatMessageRecord | null> {
    return prisma.chatMessage.findFirst({
      where: {
        sessionId,
        replyToMessageId,
        role: "ASSISTANT",
        session: { userId },
      },
      select: chatMessageSelect,
    });
  }

  public async getMemoryState(userId: string, sessionId: string): Promise<ChatMemoryState | null> {
    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
      select: { summary: true, summarizedCount: true, _count: { select: { messages: true } } },
    });

    return session
      ? {
          messageCount: session._count.messages,
          summary: session.summary,
          summarizedCount: session.summarizedCount,
        }
      : null;
  }

  /** Messages by position in the chat, oldest first. */
  public listMessageRange(data: ListChatMessageRangeData): Promise<ChatMessageRecord[]> {
    return prisma.chatMessage.findMany({
      where: { sessionId: data.sessionId, session: { userId: data.userId } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: data.skip,
      take: data.take,
      select: chatMessageSelect,
    });
  }

  /** Stores a newer summary; false when another turn already moved it on. */
  public async saveSummary(data: SaveChatSummaryData): Promise<boolean> {
    const { count } = await prisma.chatSession.updateMany({
      where: { id: data.sessionId, userId: data.userId, summarizedCount: data.previousCount },
      data: { summary: data.summary, summarizedCount: data.summarizedCount, summaryUpdatedAt: new Date() },
    });

    return count > 0;
  }

  public async listRecentMessages(
    data: ListRecentChatMessagesData,
  ): Promise<ChatMessageRecord[]> {
    const messages = await prisma.chatMessage.findMany({
      where: {
        sessionId: data.sessionId,
        session: { userId: data.userId },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: data.take,
      select: chatMessageSelect,
    });

    return messages.reverse();
  }

  public saveAssistantTurn(
    data: SaveAssistantTurnData,
  ): Promise<ChatSessionWithMessagesRecord> {
    const assistantMessageId = randomUUID();

    return prisma.chatSession.update({
      where: {
        id: data.sessionId,
        userId: data.userId,
        status: "ACTIVE",
      },
      data: {
        updatedAt: new Date(),
        ...draftColumns(data.draft),
        messages: {
          create: {
            id: assistantMessageId,
            clientMessageId: null,
            replyToMessageId: data.replyToMessageId,
            role: "ASSISTANT",
            content: data.content,
            structuredData:
              data.structuredData as unknown as Prisma.InputJsonObject,
          },
        },
      },
      select: {
        ...chatSessionSelect,
        messages: {
          where: { id: assistantMessageId },
          select: chatMessageSelect,
        },
      },
    });
  }

  public updateDraft(data: UpdateChatDraftData): Promise<ChatSessionRecord> {
    return prisma.chatSession.update({
      where: { id: data.sessionId, userId: data.userId },
      data: draftColumns(data.draft),
      select: chatSessionSelect,
    });
  }

  /** Flags a chat for staff; asking again only updates the reason. */
  public requestHandoff(userId: string, sessionId: string, reason: string | null): Promise<ChatSessionRecord> {
    return prisma.chatSession.update({
      where: { id: sessionId, userId },
      data: { handoffRequestedAt: new Date(), handoffReason: reason, handoffResolvedAt: null },
      select: chatSessionSelect,
    });
  }
}

export const chatDal = new ChatDal();
