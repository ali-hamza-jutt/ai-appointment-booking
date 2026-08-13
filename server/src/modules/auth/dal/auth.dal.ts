import { prisma } from "../../../infrastructure/database/prisma.js";

const publicUserSelect = {
  id: true,
  email: true,
  fullName: true,
} as const;

const credentialUserSelect = {
  ...publicUserSelect,
  passwordHash: true,
} as const;

export interface CreateUserData {
  email: string;
  fullName: string;
  passwordHash: string;
}

export interface PublicUserRecord {
  id: string;
  email: string;
  fullName: string;
}

export interface CredentialUserRecord extends PublicUserRecord {
  passwordHash: string;
}

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
}

export const authDal = new AuthDal();
