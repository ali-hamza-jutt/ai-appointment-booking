import { randomUUID } from "node:crypto";

import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../infrastructure/database/prisma.js";
import { bookingSelect } from "../../bookings/dal/booking.dal.js";
import type {
  ConfirmChatBookingData,
  ConfirmedChatBookingRecord,
} from "../dto/chat.dto.js";
import { chatMessageSelect, chatSessionSelect } from "./chat.dal.js";

export class ChatBookingDal {
  /** Closes the session and records the assistant's confirmation message. */
  public completeBooking(
    data: ConfirmChatBookingData,
  ): Promise<ConfirmedChatBookingRecord> {
    const assistantMessageId = randomUUID();

    return prisma.chatSession.update({
      where: {
        id: data.sessionId,
        userId: data.userId,
        status: "ACTIVE",
      },
      data: {
        status: "CLOSED",
        updatedAt: new Date(),
        messages: {
          create: {
            id: assistantMessageId,
            clientMessageId: null,
            replyToMessageId: null,
            role: "ASSISTANT",
            content: data.assistantContent,
            structuredData:
              data.assistantStructuredData as unknown as Prisma.InputJsonObject,
          },
        },
      },
      select: {
        ...chatSessionSelect,
        booking: { select: bookingSelect },
        messages: {
          where: { id: assistantMessageId },
          select: chatMessageSelect,
        },
      },
    });
  }

  public async findConfirmedBooking(
    userId: string,
    sessionId: string,
  ): Promise<ConfirmedChatBookingRecord | null> {
    const session = await prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        userId,
        booking: { isNot: null },
      },
      select: {
        ...chatSessionSelect,
        booking: { select: bookingSelect },
      },
    });

    if (!session?.booking) {
      return null;
    }

    const assistantMessage = await prisma.chatMessage.findFirst({
      where: {
        sessionId,
        role: "ASSISTANT",
        structuredData: {
          path: ["appointmentId"],
          equals: session.booking.id,
        },
      },
      select: chatMessageSelect,
    });

    return {
      ...session,
      messages: assistantMessage ? [assistantMessage] : [],
    };
  }
}

export const chatBookingDal = new ChatBookingDal();
