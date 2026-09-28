import { prisma, type DbClient } from "../../../infrastructure/database/prisma.js";
import type {
  CreateUserData,
  GoogleUserRecord,
  PublicUserRecord,
} from "../dto/auth.dto.js";

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  emailVerifiedAt: true,
  phone: true,
  passwordHash: true,
  platformRole: true,
} as const;

const googleUserSelect = { ...userSelect, googleSubject: true } as const;

export class AuthDal {
  public createUser(data: CreateUserData, client: DbClient = prisma): Promise<PublicUserRecord> {
    return client.user.create({ data, select: userSelect });
  }

  public findUserByEmail(email: string): Promise<PublicUserRecord | null> {
    return prisma.user.findUnique({ where: { email }, select: userSelect });
  }

  public findUserById(userId: string, client: DbClient = prisma): Promise<PublicUserRecord | null> {
    return client.user.findUnique({ where: { id: userId }, select: userSelect });
  }

  public findUserByPhone(phone: string): Promise<PublicUserRecord | null> {
    return prisma.user.findUnique({ where: { phone }, select: userSelect });
  }

  public findGoogleUser(subject: string, email: string): Promise<GoogleUserRecord[]> {
    return prisma.user.findMany({
      where: { OR: [{ googleSubject: subject }, { email }] },
      select: googleUserSelect,
    });
  }

  public updateUser(
    userId: string,
    data: {
      passwordHash?: string | null;
      emailVerifiedAt?: Date;
      googleSubject?: string;
      phone?: string;
      phoneVerifiedAt?: Date;
    },
    client: DbClient = prisma,
  ): Promise<PublicUserRecord> {
    return client.user.update({ where: { id: userId }, data, select: userSelect });
  }
}

export const authDal = new AuthDal();
