import { prisma } from "../../../infrastructure/database/prisma.js";
import type {
  CreateUserData,
  CredentialUserRecord,
  PublicUserRecord,
} from "../dto/auth.dto.js";

const publicUserSelect = {
  id: true,
  email: true,
  fullName: true,
} as const;

const credentialUserSelect = {
  ...publicUserSelect,
  passwordHash: true,
} as const;

export class AuthDal {
  public createUser(data: CreateUserData): Promise<PublicUserRecord> {
    return prisma.user.create({
      data,
      select: publicUserSelect,
    });
  }

  public findUserCredentialsByEmail(
    email: string,
  ): Promise<CredentialUserRecord | null> {
    return prisma.user.findUnique({
      where: { email },
      select: credentialUserSelect,
    });
  }

  public findPublicUserById(userId: string): Promise<PublicUserRecord | null> {
    return prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });
  }
}

export const authDal = new AuthDal();
