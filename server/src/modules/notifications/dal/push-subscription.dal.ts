import { prisma } from "../../../infrastructure/database/prisma.js";

const targetSelect = { id: true, endpoint: true, p256dh: true, auth: true } as const;

export class PushSubscriptionDal {
  /** Saves a browser for the user; a browser that moved to another account now belongs to this one. */
  public async save(userId: string, subscription: { endpoint: string; p256dh: string; auth: string }): Promise<void> {
    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: { userId, ...subscription },
      update: { userId, p256dh: subscription.p256dh, auth: subscription.auth },
    });
  }

  public async remove(userId: string, endpoint: string): Promise<void> {
    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  public async removeById(id: string): Promise<void> {
    await prisma.pushSubscription.deleteMany({ where: { id } });
  }

  public listForUser(userId: string) {
    return prisma.pushSubscription.findMany({ where: { userId }, select: targetSelect });
  }

  public countForUser(userId: string): Promise<number> {
    return prisma.pushSubscription.count({ where: { userId } });
  }
}

export const pushSubscriptionDal = new PushSubscriptionDal();
