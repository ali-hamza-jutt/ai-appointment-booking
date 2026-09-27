import { CATALOG_CONSTANTS } from "../../../constants/app.constants.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../infrastructure/database/prisma.js";
import { escapeLikePattern } from "../../../utils/text.js";
import type {
  CreateServiceData,
  PublicServiceRecord,
  ServiceCategoryRecord,
  ServiceRecord,
  ServiceWriteData,
} from "../dto/catalog.dto.js";

const categorySelect = {
  id: true,
  name: true,
  sortOrder: true,
} as const;

export const serviceSelect = {
  id: true,
  name: true,
  description: true,
  bookingType: true,
  capacity: true,
  durationMinutes: true,
  priceMinor: true,
  currency: true,
  depositMinor: true,
  paymentMode: true,
  bufferBeforeMin: true,
  bufferAfterMin: true,
  isActive: true,
  onlineBookable: true,
  sortOrder: true,
  policyOverrides: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
} as const;

export class CatalogDal {
  public listCategories(businessId: string): Promise<ServiceCategoryRecord[]> {
    return prisma.serviceCategory.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: categorySelect,
    });
  }

  public createCategory(
    businessId: string,
    name: string,
    sortOrder: number,
  ): Promise<ServiceCategoryRecord> {
    return prisma.serviceCategory.create({
      data: { businessId, name, sortOrder },
      select: categorySelect,
    });
  }

  public updateCategory(
    businessId: string,
    categoryId: string,
    data: { name?: string; sortOrder?: number },
  ): Promise<ServiceCategoryRecord> {
    return prisma.serviceCategory.update({
      where: { id: categoryId, businessId },
      data,
      select: categorySelect,
    });
  }

  public async deleteCategory(businessId: string, categoryId: string): Promise<void> {
    await prisma.serviceCategory.delete({
      where: { id: categoryId, businessId },
    });
  }

  public async categoryExists(businessId: string, categoryId: string): Promise<boolean> {
    const count = await prisma.serviceCategory.count({
      where: { id: categoryId, businessId },
    });

    return count > 0;
  }

  public async locationExists(businessId: string, locationId: string): Promise<boolean> {
    const count = await prisma.location.count({
      where: { id: locationId, businessId },
    });

    return count > 0;
  }

  public listServices(businessId: string): Promise<ServiceRecord[]> {
    return prisma.service.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: serviceSelect,
    });
  }

  public findService(businessId: string, serviceId: string): Promise<ServiceRecord | null> {
    return prisma.service.findFirst({
      where: { id: serviceId, businessId },
      select: serviceSelect,
    });
  }

  public createService(data: CreateServiceData): Promise<ServiceRecord> {
    const { policyOverrides, ...fields } = data;

    return prisma.service.create({
      data: { ...fields, policyOverrides: policyOverrides as Prisma.InputJsonObject },
      select: serviceSelect,
    });
  }

  public updateService(
    businessId: string,
    serviceId: string,
    data: ServiceWriteData,
  ): Promise<ServiceRecord> {
    const { policyOverrides, ...fields } = data;

    return prisma.service.update({
      where: { id: serviceId, businessId },
      data: { ...fields, policyOverrides: policyOverrides as Prisma.InputJsonObject },
      select: serviceSelect,
    });
  }

  public listPublicServices(businessId: string): Promise<PublicServiceRecord[]> {
    return prisma.$queryRaw<PublicServiceRecord[]>`
      SELECT
        "services"."id",
        "services"."name",
        "services"."description",
        "service_categories"."name" AS "categoryName",
        "services"."booking_type"::text AS "bookingType",
        "services"."capacity",
        "services"."duration_minutes" AS "durationMinutes",
        "services"."price_minor" AS "priceMinor",
        "services"."currency",
        "services"."deposit_minor" AS "depositMinor"
      FROM "services"
      LEFT JOIN "service_categories"
        ON "service_categories"."id" = "services"."category_id"
      WHERE "services"."business_id" = ${businessId}::uuid
        AND "services"."is_active"
        AND "services"."online_bookable"
      ORDER BY
        "service_categories"."sort_order" NULLS LAST,
        "services"."sort_order",
        "services"."name"
    `;
  }

  /**
   * Fuzzy name search, best match first. Scores compare names with spaces and
   * punctuation removed, so "hair cut" matches "Haircut – Men" strongly.
   */
  public searchPublicServices(
    businessId: string,
    search: string,
    compactSearch: string,
  ): Promise<PublicServiceRecord[]> {
    return prisma.$queryRaw<PublicServiceRecord[]>`
      SELECT
        "matches"."id",
        "matches"."name",
        "matches"."description",
        "matches"."categoryName",
        "matches"."bookingType",
        "matches"."capacity",
        "matches"."durationMinutes",
        "matches"."priceMinor",
        "matches"."currency",
        "matches"."depositMinor"
      FROM (
        SELECT
          "services"."id",
          "services"."name",
          "services"."description",
          "service_categories"."name" AS "categoryName",
          "services"."booking_type"::text AS "bookingType",
          "services"."capacity",
          "services"."duration_minutes" AS "durationMinutes",
          "services"."price_minor" AS "priceMinor",
          "services"."currency",
          "services"."deposit_minor" AS "depositMinor",
          GREATEST(
            similarity("services"."name", ${search}),
            word_similarity(
              ${compactSearch},
              regexp_replace(lower("services"."name"), '[^[:alnum:]]', '', 'g')
            )
          ) AS "score"
        FROM "services"
        LEFT JOIN "service_categories"
          ON "service_categories"."id" = "services"."category_id"
        WHERE "services"."business_id" = ${businessId}::uuid
          AND "services"."is_active"
          AND "services"."online_bookable"
      ) AS "matches"
      WHERE "matches"."score" > ${CATALOG_CONSTANTS.SEARCH_SIMILARITY_THRESHOLD}
        OR "matches"."name" ILIKE '%' || ${escapeLikePattern(search)} || '%'
      ORDER BY "matches"."score" DESC, "matches"."name"
      LIMIT ${CATALOG_CONSTANTS.MAX_SEARCH_RESULTS}
    `;
  }
}

export const catalogDal = new CatalogDal();
