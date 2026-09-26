import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../infrastructure/database/prisma.js";
import type {
  AuthorizationMembershipRecord,
  BusinessRecord,
  CreateBusinessData,
  MembershipBusinessRecord,
  UpdateBusinessData,
} from "../dto/business.dto.js";

export const businessSelect = {
  id: true,
  slug: true,
  name: true,
  vertical: true,
  timeZone: true,
  currency: true,
  settings: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class BusinessDal {
  public createBusiness(data: CreateBusinessData): Promise<BusinessRecord> {
    return prisma.business.create({
      data: {
        slug: data.slug,
        name: data.name,
        vertical: data.vertical,
        timeZone: data.timeZone,
        currency: data.currency,
        settings: data.settings as unknown as Prisma.InputJsonObject,
        memberships: {
          create: { userId: data.ownerUserId, role: "OWNER" },
        },
        locations: {
          create: data.location,
        },
      },
      select: businessSelect,
    });
  }

  public findBusinessById(businessId: string): Promise<BusinessRecord | null> {
    return prisma.business.findUnique({
      where: { id: businessId },
      select: businessSelect,
    });
  }

  public updateBusiness(
    businessId: string,
    data: UpdateBusinessData,
  ): Promise<BusinessRecord> {
    const { settings, ...fields } = data;

    return prisma.business.update({
      where: { id: businessId },
      data: {
        ...fields,
        ...(settings
          ? { settings: settings as unknown as Prisma.InputJsonObject }
          : {}),
      },
      select: businessSelect,
    });
  }

  public listBusinessesForUser(
    userId: string,
  ): Promise<MembershipBusinessRecord[]> {
    return prisma.membership.findMany({
      where: { userId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        role: true,
        business: {
          select: { id: true, slug: true, name: true, vertical: true },
        },
      },
    });
  }

  public findMembershipRole(
    userId: string,
    businessId: string,
  ): Promise<AuthorizationMembershipRecord | null> {
    return prisma.membership.findUnique({
      where: { userId_businessId: { userId, businessId } },
      select: { role: true },
    });
  }

  public async isPlatformAdmin(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { platformRole: true },
    });

    return user?.platformRole === "ADMIN";
  }
}

export const businessDal = new BusinessDal();
