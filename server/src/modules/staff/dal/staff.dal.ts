import { prisma } from "../../../infrastructure/database/prisma.js";
import type {
  PublicStaffResponse,
  StaffAssignmentData,
  StaffProfileData,
  StaffRecord,
} from "../dto/staff.dto.js";

const staffSelect = {
  id: true,
  userId: true,
  displayName: true,
  email: true,
  bio: true,
  avatarUrl: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  services: {
    orderBy: { service: { name: "asc" } },
    select: {
      customDurationMinutes: true,
      customPriceMinor: true,
      service: { select: { id: true, name: true } },
    },
  },
  locations: {
    orderBy: { location: { name: "asc" } },
    select: { location: { select: { id: true, name: true } } },
  },
} as const;

export class StaffDal {
  public listStaff(businessId: string): Promise<StaffRecord[]> {
    return prisma.staff.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
      select: staffSelect,
    });
  }

  public findStaff(businessId: string, staffId: string): Promise<StaffRecord | null> {
    return prisma.staff.findFirst({
      where: { id: staffId, businessId },
      select: staffSelect,
    });
  }

  public createStaff(
    businessId: string,
    profile: StaffProfileData,
    assignments: StaffAssignmentData,
  ): Promise<StaffRecord> {
    return prisma.staff.create({
      data: {
        businessId,
        ...profile,
        services: { createMany: { data: assignments.services } },
        locations: {
          createMany: {
            data: assignments.locationIds.map((locationId) => ({ locationId })),
          },
        },
      },
      select: staffSelect,
    });
  }

  /** Updates the profile and, when provided, replaces assignments atomically. */
  public updateStaff(
    businessId: string,
    staffId: string,
    profile: StaffProfileData,
    assignments: Partial<StaffAssignmentData>,
  ): Promise<StaffRecord> {
    return prisma.$transaction(async (transaction) => {
      await transaction.staff.update({
        where: { id: staffId, businessId },
        data: profile,
        select: { id: true },
      });

      if (assignments.services) {
        await transaction.serviceProvider.deleteMany({ where: { staffId } });
        await transaction.serviceProvider.createMany({
          data: assignments.services.map((service) => ({ ...service, staffId })),
        });
      }

      if (assignments.locationIds) {
        await transaction.staffLocation.deleteMany({ where: { staffId } });
        await transaction.staffLocation.createMany({
          data: assignments.locationIds.map((locationId) => ({ staffId, locationId })),
        });
      }

      return transaction.staff.findFirstOrThrow({
        where: { id: staffId, businessId },
        select: staffSelect,
      });
    });
  }

  public listPublicStaff(
    businessId: string,
    serviceId?: string,
  ): Promise<PublicStaffResponse[]> {
    return prisma.staff.findMany({
      where: {
        businessId,
        isActive: true,
        ...(serviceId
          ? { services: { some: { serviceId, service: { isActive: true } } } }
          : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
      select: { id: true, displayName: true, bio: true, avatarUrl: true },
    });
  }

  public async countServices(businessId: string, serviceIds: string[]): Promise<number> {
    return prisma.service.count({ where: { businessId, id: { in: serviceIds } } });
  }

  public async countLocations(businessId: string, locationIds: string[]): Promise<number> {
    return prisma.location.count({ where: { businessId, id: { in: locationIds } } });
  }

  public async isBusinessMember(businessId: string, userId: string): Promise<boolean> {
    const count = await prisma.membership.count({ where: { businessId, userId } });

    return count > 0;
  }
}

export const staffDal = new StaffDal();
