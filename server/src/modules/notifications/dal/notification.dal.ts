import { prisma } from "../../../infrastructure/database/prisma.js";
import { isUniqueConstraintError } from "../../../utils/database.js";
import type {
  BookingNotificationContextRecord,
  BookingNotificationResponse,
  ClaimNotificationData,
  NotificationChannel,
  NotificationClaim,
  NotificationKind,
  NotificationStatus,
  NotificationTemplateRecord,
  UserNotificationSettingsRecord,
} from "../dto/notification.dto.js";

/** Messages in these states may be (re)sent when their event is delivered again. */
const SENDABLE: readonly NotificationStatus[] = ["PENDING", "FAILED"];

export class NotificationDal {
  public findBookingContext(
    businessId: string,
    bookingId: string,
  ): Promise<BookingNotificationContextRecord | null> {
    return prisma.booking.findFirst({
      where: { id: bookingId, businessId },
      select: {
        id: true,
        businessId: true,
        status: true,
        scheduledAt: true,
        endsAt: true,
        timeZone: true,
        serviceName: true,
        rescheduleCount: true,
        holdExpiresAt: true,
        staff: { select: { displayName: true } },
        service: { select: { location: { select: { name: true, address: true } } } },
        business: {
          select: {
            name: true,
            slug: true,
            settings: true,
            locations: {
              where: { isActive: true },
              orderBy: { createdAt: "asc" },
              take: 1,
              select: { name: true, address: true },
            },
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            user: { select: { email: true, phone: true, phoneVerifiedAt: true } },
            notificationPreferences: { select: { channel: true, optedIn: true } },
          },
        },
      },
    });
  }

  public listTemplates(businessId: string): Promise<NotificationTemplateRecord[]> {
    return prisma.notificationTemplate.findMany({
      where: { businessId },
      select: { channel: true, kind: true, subject: true, body: true },
    });
  }

  public async upsertTemplate(
    businessId: string,
    template: NotificationTemplateRecord,
  ): Promise<NotificationTemplateRecord> {
    return prisma.notificationTemplate.upsert({
      where: {
        businessId_channel_kind: { businessId, channel: template.channel, kind: template.kind },
      },
      create: { businessId, ...template },
      update: { subject: template.subject, body: template.body },
      select: { channel: true, kind: true, subject: true, body: true },
    });
  }

  public async deleteTemplate(
    businessId: string,
    channel: NotificationChannel,
    kind: NotificationKind,
  ): Promise<void> {
    await prisma.notificationTemplate.deleteMany({ where: { businessId, channel, kind } });
  }

  /**
   * Records a message before it is sent. A message whose key was seen before
   * is sent again only if it never went out.
   */
  public async claim(data: ClaimNotificationData): Promise<NotificationClaim> {
    try {
      const created = await prisma.notification.create({ data, select: { id: true } });

      return { id: created.id, send: data.status === "PENDING" };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
    }

    const existing = await prisma.notification.findFirstOrThrow({
      where: { businessId: data.businessId, dedupeKey: data.dedupeKey },
      select: { id: true, status: true },
    });

    return { id: existing.id, send: SENDABLE.includes(existing.status) };
  }

  public async markSent(businessId: string, id: string, providerMessageId: string | null): Promise<void> {
    await prisma.notification.updateMany({
      where: { businessId, id },
      data: { status: "SENT", providerMessageId, error: null, sentAt: new Date() },
    });
  }

  public async markFailed(businessId: string, id: string, error: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { businessId, id },
      data: { status: "FAILED", error },
    });
  }

  /**
   * Applies a provider's delivery report. Reports can arrive out of order,
   * so a delivered or failed message never goes back to sent.
   */
  public async recordDeliveryStatus(
    providerMessageId: string,
    status: "SENT" | "DELIVERED" | "FAILED",
    error: string | null,
  ): Promise<number> {
    const from: NotificationStatus[] = status === "SENT" ? ["PENDING"] : ["PENDING", "SENT"];
    const { count } = await prisma.notification.updateMany({
      where: { providerMessageId, status: { in: from } },
      data: {
        status,
        ...(status === "DELIVERED" ? { deliveredAt: new Date() } : {}),
        ...(error ? { error } : {}),
      },
    });

    return count;
  }

  public listForBooking(
    businessId: string,
    bookingId: string,
    take: number,
  ): Promise<BookingNotificationResponse[]> {
    return prisma.notification.findMany({
      where: { businessId, bookingId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        channel: true,
        kind: true,
        status: true,
        recipient: true,
        error: true,
        sentAt: true,
        deliveredAt: true,
        createdAt: true,
      },
    });
  }

  /** Every business the user is a customer of, with their channel choices. */
  public async listSettingsForUser(userId: string): Promise<UserNotificationSettingsRecord[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        customers: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            business: { select: { id: true, name: true, slug: true } },
            notificationPreferences: { select: { channel: true, optedIn: true } },
          },
        },
      },
    });

    return (user?.customers ?? []).map((customer) => ({
      customerId: customer.id,
      business: customer.business,
      preferences: customer.notificationPreferences,
    }));
  }

  public async findCustomerIdForUser(businessId: string, userId: string): Promise<string | null> {
    const customer = await prisma.customer.findFirst({
      where: { businessId, userId },
      select: { id: true },
    });

    return customer?.id ?? null;
  }

  public async setPreference(
    businessId: string,
    customerId: string,
    channel: NotificationChannel,
    optedIn: boolean,
  ): Promise<void> {
    await prisma.notificationPreference.upsert({
      where: { customerId_channel: { customerId, channel } },
      create: { businessId, customerId, channel, optedIn },
      update: { optedIn },
    });
  }
}

export const notificationDal = new NotificationDal();
