import type { PhoneVerificationPurpose } from "../../../generated/prisma/client.js";
import { prisma } from "../../../infrastructure/database/prisma.js";

export interface PhoneVerificationRecord {
  id: string;
  codeHash: string;
  attempts: number;
  createdAt: Date;
}

interface PhoneVerificationKey {
  phone: string;
  purpose: PhoneVerificationPurpose;
  userId: string | null;
}

export class PhoneVerificationDal {
  public findLatest(key: PhoneVerificationKey): Promise<PhoneVerificationRecord | null> {
    return prisma.phoneVerification.findFirst({
      where: key,
      orderBy: { createdAt: "desc" },
      select: { id: true, codeHash: true, attempts: true, createdAt: true },
    });
  }

  /** The newest code that can still be tried. */
  public findActive(key: PhoneVerificationKey, now: Date, maxAttempts: number) {
    return prisma.phoneVerification.findFirst({
      where: { ...key, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: maxAttempts } },
      orderBy: { createdAt: "desc" },
      select: { id: true, codeHash: true, attempts: true, createdAt: true },
    });
  }

  /** Replaces any open code for this key with a new one. */
  public async replace(key: PhoneVerificationKey, codeHash: string, expiresAt: Date): Promise<void> {
    await prisma.$transaction([
      prisma.phoneVerification.updateMany({
        where: { ...key, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      prisma.phoneVerification.create({ data: { ...key, codeHash, expiresAt } }),
    ]);
  }

  /** Counts an attempt; false if the code ran out of attempts meanwhile. */
  public async recordAttempt(id: string, maxAttempts: number): Promise<boolean> {
    const result = await prisma.phoneVerification.updateMany({
      where: { id, consumedAt: null, attempts: { lt: maxAttempts } },
      data: { attempts: { increment: 1 } },
    });

    return result.count === 1;
  }

  public async consume(id: string): Promise<boolean> {
    const result = await prisma.phoneVerification.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    return result.count === 1;
  }
}

export const phoneVerificationDal = new PhoneVerificationDal();
