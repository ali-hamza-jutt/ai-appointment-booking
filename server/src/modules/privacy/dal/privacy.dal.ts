import { PRIVACY_CONSTANTS } from "../../../constants/app.constants.js";
import { prisma } from "../../../infrastructure/database/prisma.js";

/** Bookings still ahead that the customer would lose track of if their details were erased. */
const UPCOMING = ["HELD", "PENDING_PAYMENT", "PENDING", "CONFIRMED"] as const;

export interface CustomerRow {
  id: string;
  businessId: string;
  userId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: Date;
  business: { id: string; name: string };
}

const customerSelect = {
  id: true,
  businessId: true,
  userId: true,
  name: true,
  email: true,
  phone: true,
  notes: true,
  createdAt: true,
  business: { select: { id: true, name: true } },
} as const;

export class PrivacyDal {
  public findCustomer(businessId: string, customerId: string): Promise<CustomerRow | null> {
    return prisma.customer.findFirst({ where: { businessId, id: customerId }, select: customerSelect });
  }

  /** The user's customer records at every business (a nested read, so it spans businesses). */
  public async customersOfUser(userId: string): Promise<CustomerRow[]> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { customers: { select: customerSelect } } });

    return user?.customers ?? [];
  }

  public findUser(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, phone: true, createdAt: true },
    });
  }

  /** Everything the business holds about the customer, for an export. */
  public async collect(customer: CustomerRow) {
    const where = { businessId: customer.businessId, customerId: customer.id };
    const [bookings, reviews, waitlist, preferences, notifications, chats] = await Promise.all([
      prisma.booking.findMany({
        where,
        orderBy: { scheduledAt: "asc" },
        select: {
          id: true,
          serviceName: true,
          scheduledAt: true,
          status: true,
          priceMinor: true,
          currency: true,
          notes: true,
          createdAt: true,
          staff: { select: { displayName: true } },
        },
      }),
      prisma.review.findMany({ where, select: { rating: true, comment: true, reply: true, createdAt: true } }),
      prisma.waitlistEntry.findMany({
        where,
        select: { fromDate: true, toDate: true, status: true, createdAt: true, service: { select: { name: true } } },
      }),
      prisma.customerPreference.findMany({ where, select: { key: true, value: true, source: true } }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "asc" },
        select: { channel: true, kind: true, status: true, recipient: true, createdAt: true },
      }),
      customer.userId
        ? prisma.chatSession.findMany({
            where: { businessId: customer.businessId, userId: customer.userId },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              channel: true,
              createdAt: true,
              messages: {
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                take: PRIVACY_CONSTANTS.EXPORT_MESSAGES_PER_CHAT,
                select: { role: true, content: true, createdAt: true },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    return { bookings, reviews, waitlist, preferences, notifications, chats };
  }

  public countUpcoming(businessId: string, customerId: string, now: Date): Promise<number> {
    return prisma.booking.count({
      where: { businessId, customerId, status: { in: [...UPCOMING] }, scheduledAt: { gt: now } },
    });
  }

  /**
   * Removes a customer's personal details at one business. Their bookings
   * stay, as the business's records of what happened, under an anonymous
   * name and without notes; everything else about them is deleted.
   */
  public async erase(customer: CustomerRow, erasedName: string): Promise<void> {
    const where = { businessId: customer.businessId, customerId: customer.id };

    await prisma.$transaction(async (transaction) => {
      if (customer.userId) {
        await transaction.chatSession.deleteMany({ where: { businessId: customer.businessId, userId: customer.userId } });
      }

      await transaction.review.deleteMany({ where });
      await transaction.waitlistEntry.deleteMany({ where });
      await transaction.customerPreference.deleteMany({ where });
      await transaction.notificationPreference.deleteMany({ where });
      await transaction.notification.deleteMany({ where });
      await transaction.booking.updateMany({ where, data: { notes: null } });
      await transaction.customer.updateMany({
        where: { businessId: customer.businessId, id: customer.id },
        data: { name: erasedName, email: null, phone: null, notes: null, userId: null },
      });
    });
  }

  /** Businesses where this user is the only owner, which would be left with nobody in charge. */
  public async businessesOnlyOwnedBy(userId: string): Promise<string[]> {
    const owned = await prisma.membership.findMany({ where: { userId, role: "OWNER" }, select: { businessId: true } });
    const sole: string[] = [];

    for (const { businessId } of owned) {
      if ((await prisma.membership.count({ where: { businessId, role: "OWNER" } })) === 1) sole.push(businessId);
    }

    return sole;
  }

  public async deleteUser(userId: string): Promise<void> {
    await prisma.user.delete({ where: { id: userId } });
  }

  public listBusinessSettings() {
    return prisma.business.findMany({ select: { id: true, settings: true } });
  }

  public async deleteChatsUntouchedSince(businessId: string, cutoff: Date): Promise<number> {
    const result = await prisma.chatSession.deleteMany({ where: { businessId, updatedAt: { lt: cutoff } } });

    return result.count;
  }
}

export const privacyDal = new PrivacyDal();
