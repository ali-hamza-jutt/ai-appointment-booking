import type { AuthTokenPurpose } from "../../../generated/prisma/client.js";
import { prisma, type DbClient } from "../../../infrastructure/database/prisma.js";

export class AuthTokenDal {
  /** Stores a new link token and retires any earlier unused one for the same purpose. */
  public async replace(data: {
    userId: string;
    purpose: AuthTokenPurpose;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await prisma.$transaction([
      prisma.authToken.updateMany({
        where: { userId: data.userId, purpose: data.purpose, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.authToken.create({ data }),
    ]);
  }

  /** Uses a live token exactly once; returns its user, or null. */
  public async consume(
    tokenHash: string,
    purpose: AuthTokenPurpose,
    now: Date,
    client: DbClient = prisma,
  ): Promise<string | null> {
    const token = await client.authToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, purpose: true },
    });

    if (!token || token.purpose !== purpose) return null;

    const result = await client.authToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });

    return result.count === 1 ? token.userId : null;
  }
}

export const authTokenDal = new AuthTokenDal();
