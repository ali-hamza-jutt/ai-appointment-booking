import { randomUUID } from "node:crypto";

import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../infrastructure/database/prisma.js";
import {
  appointmentDal,
  appointmentSelect,
} from "../../appointments/dal/appointment.dal.js";
import type {
  ConfirmChatBookingData,
  ConfirmedChatBookingRecord,
} from "../dto/chat.dto.js";
import { chatMessageSelect, chatSessionSelect } from "./chat.dal.js";

export class ChatBookingDal {
  public confirmBooking(
    data: ConfirmChatBookingData,
  ): Promise<ConfirmedChatBookingRecord> {
    const assistantMessageId = randomUUID();

    return prisma.$transaction(async (transaction) => {
      await appointmentDal.lockAppointmentSchedule(transaction, data.userId);
      await appointmentDal.ensureAppointmentSlotAvailable(transaction, data);

      return transaction.chatSession.update({
        where: {
          id: data.sessionId,
          userId: data.userId,
          status: "ACTIVE",
        },
        data: {
          status: "CLOSED",
          updatedAt: new Date(),
          appointment: {
            create: {
              id: data.appointmentId,
              user: { connect: { id: data.userId } },
              serviceName: data.serviceName,
              scheduledAt: data.scheduledAt,
              timeZone: data.timeZone,
              durationMinutes: data.durationMinutes,
              source: "CHAT",
              notes: data.notes,
            },
          },
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
          appointment: { select: appointmentSelect },
          messages: {
            where: { id: assistantMessageId },
            select: chatMessageSelect,
          },
        },
      });
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
        appointment: { isNot: null },
      },
      select: {
        ...chatSessionSelect,
        appointment: { select: appointmentSelect },
      },
    });

    if (!session?.appointment) {
      return null;
    }

    const assistantMessage = await prisma.chatMessage.findFirst({
      where: {
        sessionId,
        role: "ASSISTANT",
        structuredData: {
          path: ["appointmentId"],
          equals: session.appointment.id,
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
