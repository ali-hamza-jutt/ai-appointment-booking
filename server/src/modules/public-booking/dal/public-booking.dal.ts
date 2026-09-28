import { prisma } from "../../../infrastructure/database/prisma.js";
import type { AllowedOriginResponse } from "../dto/public-booking.dto.js";

interface GuestCodeKey {
  email: string;
  businessId: string;
}

const originSelect = { id: true, origin: true, createdAt: true } as const;

export class PublicBookingDal {
  public findLatestCode(key: GuestCodeKey) {
    return prisma.guestCode.findFirst({
      where: key,
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    });
  }

  /** The newest code for this email and business that can still be tried. */
  public findActiveCode(key: GuestCodeKey, now: Date, maxAttempts: number) {
    return prisma.guestCode.findFirst({
      where: { ...key, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: maxAttempts } },
      orderBy: { createdAt: "desc" },
      select: { id: true, codeHash: true },
    });
  }

  /** Replaces any open code for this email and business with a new one. */
  public async replaceCode(key: GuestCodeKey, codeHash: string, expiresAt: Date): Promise<void> {
    await prisma.$transaction([
      prisma.guestCode.updateMany({ where: { ...key, consumedAt: null }, data: { consumedAt: new Date() } }),
      prisma.guestCode.create({ data: { ...key, codeHash, expiresAt } }),
    ]);
  }

  /** Counts a guess; false when the code ran out of guesses meanwhile. */
  public async recordAttempt(id: string, maxAttempts: number): Promise<boolean> {
    const result = await prisma.guestCode.updateMany({
      where: { id, consumedAt: null, attempts: { lt: maxAttempts } },
      data: { attempts: { increment: 1 } },
    });

    return result.count === 1;
  }

  public async consumeCode(id: string): Promise<boolean> {
    const result = await prisma.guestCode.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: new Date() } });

    return result.count === 1;
  }

  /** Saves a phone number on the customer's record unless it already has one. */
  public async setCustomerPhoneIfMissing(businessId: string, customerId: string, phone: string): Promise<void> {
    await prisma.customer.updateMany({ where: { businessId, id: customerId, phone: null }, data: { phone } });
  }

  public listOrigins(businessId: string): Promise<AllowedOriginResponse[]> {
    return prisma.allowedOrigin.findMany({ where: { businessId }, orderBy: { createdAt: "asc" }, select: originSelect });
  }

  public countOrigins(businessId: string): Promise<number> {
    return prisma.allowedOrigin.count({ where: { businessId } });
  }

  public findOrigin(businessId: string, origin: string): Promise<AllowedOriginResponse | null> {
    return prisma.allowedOrigin.findFirst({ where: { businessId, origin }, select: originSelect });
  }

  public createOrigin(businessId: string, origin: string): Promise<AllowedOriginResponse> {
    return prisma.allowedOrigin.create({ data: { businessId, origin }, select: originSelect });
  }

  public async removeOrigin(businessId: string, originId: string): Promise<boolean> {
    const result = await prisma.allowedOrigin.deleteMany({ where: { businessId, id: originId } });

    return result.count === 1;
  }
}

export const publicBookingDal = new PublicBookingDal();
