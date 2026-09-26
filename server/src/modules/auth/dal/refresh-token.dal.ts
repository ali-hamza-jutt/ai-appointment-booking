import { prisma, type DbClient } from "../../../infrastructure/database/prisma.js";

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  persistent: boolean;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}

const refreshTokenSelect = {
  id: true,
  userId: true,
  familyId: true,
  persistent: true,
  expiresAt: true,
  rotatedAt: true,
  revokedAt: true,
} as const;

export class RefreshTokenDal {
  public create(
    data: {
      userId: string;
      familyId: string;
      tokenHash: string;
      persistent: boolean;
      expiresAt: Date;
      userAgent: string | null;
    },
    client: DbClient = prisma,
  ): Promise<RefreshTokenRecord> {
    return client.refreshToken.create({ data, select: refreshTokenSelect });
  }

  public findByHash(tokenHash: string, client: DbClient = prisma): Promise<RefreshTokenRecord | null> {
    return client.refreshToken.findUnique({ where: { tokenHash }, select: refreshTokenSelect });
  }

  /** Marks a live token as used; false if another request rotated it first. */
  public async markRotated(tokenId: string, rotatedAt: Date, client: DbClient = prisma): Promise<boolean> {
    const result = await client.refreshToken.updateMany({
      where: { id: tokenId, rotatedAt: null, revokedAt: null },
      data: { rotatedAt },
    });

    return result.count === 1;
  }

  public async revokeFamily(familyId: string, client: DbClient = prisma): Promise<void> {
    await client.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  public async revokeAllForUser(userId: string, client: DbClient = prisma): Promise<void> {
    await client.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export const refreshTokenDal = new RefreshTokenDal();
