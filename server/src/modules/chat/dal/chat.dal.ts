import { randomUUID } from "node:crypto";

import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../infrastructure/database/prisma.js";
import type {
  ChatMessageRecord,
  ChatSessionRecord,
  CreateChatMessageData,
  CreateChatSessionData,
  ListChatMessagesData,
  ListChatSessionsData,
  UpdateBookingContextData,
} from "../dto/chat.dto.js";

const chatSessionSelect = {
  id: true,
  title: true,
  status: true,
  bookingContext: true,
  createdAt: true,
  updatedAt: true,
} as const;

const chatMessageSelect = {
  id: true,
  sessionId: true,
  clientMessageId: true,
  role: true,
  content: true,
  structuredData: true,
  createdAt: true,
} as const;

export class ChatDal {
  public createSession(data: CreateChatSessionData): Promise<ChatSessionRecord> {
    return prisma.chatSession.create({
      data: {
        userId: data.userId,
        title: data.title,
        ...(data.bookingContext
          ? {
              bookingContext:
                data.bookingContext as unknown as Prisma.InputJsonObject,
            }
          : {}),
      },
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
      },
      data: {
        updatedAt: new Date(),
        messages: {
          create: {
            id: messageId,
            clientMessageId: data.clientMessageId,
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

  public updateBookingContext(
    data: UpdateBookingContextData,
  ): Promise<ChatSessionRecord> {
    return prisma.chatSession.update({
      where: {
        id: data.sessionId,
        userId: data.userId,
      },
      data: {
        bookingContext:
          data.bookingContext as unknown as Prisma.InputJsonObject,
      },
      select: chatSessionSelect,
    });
  }
}

export const chatDal = new ChatDal();
