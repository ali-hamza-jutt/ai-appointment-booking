import { prisma } from "../../../infrastructure/database/prisma.js";
import type { MessagingChannel, MessagingNumberRecord } from "../dto/messaging.dto.js";

const numberSelect = { id: true, businessId: true, channel: true, address: true, createdAt: true } as const;

export class MessagingDal {
  public listNumbers(businessId: string): Promise<MessagingNumberRecord[]> {
    return prisma.messagingNumber.findMany({ where: { businessId }, orderBy: { createdAt: "asc" }, select: numberSelect });
  }

  /** The business an address belongs to; inbound messages are routed by it. */
  public findByAddress(address: string): Promise<MessagingNumberRecord | null> {
    return prisma.messagingNumber.findFirst({ where: { address }, select: numberSelect });
  }

  public createNumber(businessId: string, channel: MessagingChannel, address: string): Promise<MessagingNumberRecord> {
    return prisma.messagingNumber.create({ data: { businessId, channel, address }, select: numberSelect });
  }

  public async removeNumber(businessId: string, numberId: string): Promise<boolean> {
    const result = await prisma.messagingNumber.deleteMany({ where: { businessId, id: numberId } });

    return result.count === 1;
  }

  /**
   * An account for someone who has only ever texted: their number is
   * verified by the message itself, and the email is a placeholder that
   * never receives mail.
   */
  public createPhoneUser(phone: string, fullName: string, placeholderEmail: string, now: Date): Promise<{ id: string }> {
    return prisma.user.create({
      data: { email: placeholderEmail, fullName, passwordHash: null, phone, phoneVerifiedAt: now },
      select: { id: true },
    });
  }

  public findBusiness(businessId: string) {
    return prisma.business.findUnique({ where: { id: businessId }, select: { id: true, slug: true, timeZone: true } });
  }

  /** The cards and buttons of the assistant's latest message in a chat, for reading a numbered reply. */
  public async lastAssistantParts(sessionId: string): Promise<unknown> {
    const message = await prisma.chatMessage.findFirst({
      where: { sessionId, role: "ASSISTANT" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { structuredData: true },
    });

    return (message?.structuredData as { parts?: unknown } | null)?.parts ?? [];
  }
}

export const messagingDal = new MessagingDal();
