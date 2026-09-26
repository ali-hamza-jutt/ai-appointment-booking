import { prisma } from "../../../infrastructure/database/prisma.js";
import type {
  CreateLocationData,
  LocationRecord,
  UpdateLocationData,
} from "../dto/business.dto.js";

const locationSelect = {
  id: true,
  businessId: true,
  name: true,
  address: true,
  timeZone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class LocationDal {
  public listLocations(businessId: string): Promise<LocationRecord[]> {
    return prisma.location.findMany({
      where: { businessId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: locationSelect,
    });
  }

  public createLocation(data: CreateLocationData): Promise<LocationRecord> {
    return prisma.location.create({
      data,
      select: locationSelect,
    });
  }

  public updateLocation(
    businessId: string,
    locationId: string,
    data: UpdateLocationData,
  ): Promise<LocationRecord> {
    return prisma.location.update({
      where: { id: locationId, businessId },
      data,
      select: locationSelect,
    });
  }
}

export const locationDal = new LocationDal();
