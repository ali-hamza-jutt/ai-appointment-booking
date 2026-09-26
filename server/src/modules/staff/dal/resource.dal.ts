import { prisma } from "../../../infrastructure/database/prisma.js";
import type { ResourceRecord, ResourceWriteData } from "../dto/staff.dto.js";

const resourceSelect = {
  id: true,
  name: true,
  capacity: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  location: { select: { id: true, name: true } },
  services: {
    orderBy: { service: { name: "asc" } },
    select: { service: { select: { id: true, name: true } } },
  },
} as const;

export class ResourceDal {
  public listResources(businessId: string): Promise<ResourceRecord[]> {
    return prisma.resource.findMany({
      where: { businessId },
      orderBy: [{ location: { name: "asc" } }, { name: "asc" }],
      select: resourceSelect,
    });
  }

  public findResource(businessId: string, resourceId: string): Promise<ResourceRecord | null> {
    return prisma.resource.findFirst({
      where: { id: resourceId, businessId },
      select: resourceSelect,
    });
  }

  public createResource(
    businessId: string,
    data: ResourceWriteData,
    serviceIds: string[],
  ): Promise<ResourceRecord> {
    return prisma.resource.create({
      data: {
        businessId,
        ...data,
        services: {
          createMany: { data: serviceIds.map((serviceId) => ({ serviceId })) },
        },
      },
      select: resourceSelect,
    });
  }

  public updateResource(
    businessId: string,
    resourceId: string,
    data: ResourceWriteData,
    serviceIds?: string[],
  ): Promise<ResourceRecord> {
    return prisma.$transaction(async (transaction) => {
      await transaction.resource.update({
        where: { id: resourceId, businessId },
        data,
        select: { id: true },
      });

      if (serviceIds) {
        await transaction.serviceResource.deleteMany({ where: { resourceId } });
        await transaction.serviceResource.createMany({
          data: serviceIds.map((serviceId) => ({ serviceId, resourceId })),
        });
      }

      return transaction.resource.findFirstOrThrow({
        where: { id: resourceId, businessId },
        select: resourceSelect,
      });
    });
  }
}

export const resourceDal = new ResourceDal();
