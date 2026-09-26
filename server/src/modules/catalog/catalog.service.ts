import {
  CATALOG_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  VALIDATION_MESSAGES,
  VALIDATION_PATTERNS,
} from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import {
  isRecordNotFoundError,
  isUniqueConstraintError,
} from "../../utils/database.js";
import { assertUuid } from "../../utils/identifiers.js";
import { normalizeWhitespace, toCompactSearchText } from "../../utils/text.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import {
  compactPolicyOverrides,
  parseServicePolicyOverrides,
  servicePolicyOverridesSchema,
} from "../bookings/booking-policy.js";
import { businessService } from "../businesses/business.service.js";
import { catalogDal } from "./dal/catalog.dal.js";
import type {
  CreateServiceCategoryRequest,
  CreateServiceRequest,
  PublicServiceListResponse,
  ServiceCategoryListResponse,
  ServiceCategoryResponse,
  ServiceListResponse,
  ServiceRecord,
  ServiceResponse,
  ServiceWriteData,
  UpdateServiceCategoryRequest,
  UpdateServiceRequest,
} from "./dto/catalog.dto.js";

export class CatalogService {
  public async listCategories(businessId: string): Promise<ServiceCategoryListResponse> {
    return { items: await catalogDal.listCategories(businessId) };
  }

  public async createCategory(
    businessId: string,
    request: CreateServiceCategoryRequest,
  ): Promise<ServiceCategoryResponse> {
    try {
      return await catalogDal.createCategory(
        businessId,
        this.normalizeCategoryName(request.name),
        request.sortOrder ?? 0,
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) this.throwCategoryExists();
      throw error;
    }
  }

  public async updateCategory(
    businessId: string,
    categoryId: string,
    request: UpdateServiceCategoryRequest,
  ): Promise<ServiceCategoryResponse> {
    assertUuid("categoryId", categoryId);

    try {
      return await catalogDal.updateCategory(businessId, categoryId, {
        ...(request.name !== undefined
          ? { name: this.normalizeCategoryName(request.name) }
          : {}),
        ...(request.sortOrder !== undefined ? { sortOrder: request.sortOrder } : {}),
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) this.throwCategoryExists();
      if (isRecordNotFoundError(error)) this.throwCategoryNotFound();
      throw error;
    }
  }

  public async deleteCategory(businessId: string, categoryId: string): Promise<void> {
    assertUuid("categoryId", categoryId);

    try {
      await catalogDal.deleteCategory(businessId, categoryId);
    } catch (error) {
      if (isRecordNotFoundError(error)) this.throwCategoryNotFound();
      throw error;
    }
  }

  public async listServices(businessId: string): Promise<ServiceListResponse> {
    const services = await catalogDal.listServices(businessId);

    return { items: services.map((service) => this.toResponse(service)) };
  }

  public async getService(businessId: string, serviceId: string): Promise<ServiceResponse> {
    assertUuid("serviceId", serviceId);

    const service = await catalogDal.findService(businessId, serviceId);

    if (!service) this.throwServiceNotFound();

    return this.toResponse(service);
  }

  public async createService(
    businessId: string,
    request: CreateServiceRequest,
  ): Promise<ServiceResponse> {
    const business = await businessService.getBusiness(businessId, null);
    const data = await this.prepareServiceData(businessId, {
      name: request.name,
      description: request.description ?? null,
      categoryId: request.categoryId ?? null,
      locationId: request.locationId ?? null,
      bookingType: request.bookingType ?? "APPOINTMENT",
      capacity: request.capacity ?? 1,
      durationMinutes: request.durationMinutes,
      priceMinor: request.priceMinor,
      depositMinor: request.depositMinor ?? null,
      bufferBeforeMin: request.bufferBeforeMin ?? 0,
      bufferAfterMin: request.bufferAfterMin ?? 0,
      isActive: true,
      onlineBookable: request.onlineBookable ?? true,
      sortOrder: request.sortOrder ?? 0,
      policyOverrides: request.policyOverrides ?? {},
    });

    const service = await catalogDal.createService({
      ...data,
      businessId,
      currency: business.currency,
    });

    return this.toResponse(service);
  }

  public async updateService(
    businessId: string,
    serviceId: string,
    request: UpdateServiceRequest,
  ): Promise<ServiceResponse> {
    assertUuid("serviceId", serviceId);

    const current = await catalogDal.findService(businessId, serviceId);

    if (!current) this.throwServiceNotFound();

    const bookingType = request.bookingType ?? current.bookingType;
    const data = await this.prepareServiceData(businessId, {
      name: request.name ?? current.name,
      description:
        request.description !== undefined ? request.description : current.description,
      categoryId:
        request.categoryId !== undefined ? request.categoryId : (current.category?.id ?? null),
      locationId:
        request.locationId !== undefined ? request.locationId : (current.location?.id ?? null),
      bookingType,
      // Switching a class back to an appointment resets it to a single seat.
      capacity:
        request.capacity ?? (bookingType === "APPOINTMENT" ? 1 : current.capacity),
      durationMinutes: request.durationMinutes ?? current.durationMinutes,
      priceMinor: request.priceMinor ?? current.priceMinor,
      depositMinor:
        request.depositMinor !== undefined ? request.depositMinor : current.depositMinor,
      bufferBeforeMin: request.bufferBeforeMin ?? current.bufferBeforeMin,
      bufferAfterMin: request.bufferAfterMin ?? current.bufferAfterMin,
      isActive: request.isActive ?? current.isActive,
      onlineBookable: request.onlineBookable ?? current.onlineBookable,
      sortOrder: request.sortOrder ?? current.sortOrder,
      policyOverrides:
        request.policyOverrides ?? parseServicePolicyOverrides(current.policyOverrides),
    });

    try {
      const service = await catalogDal.updateService(businessId, serviceId, data);
      return this.toResponse(service);
    } catch (error) {
      if (isRecordNotFoundError(error)) this.throwServiceNotFound();
      throw error;
    }
  }

  public async listPublicServices(
    slug: string,
    search?: string,
  ): Promise<PublicServiceListResponse> {
    const business = await businessService.getPublicBusiness(slug);
    const normalizedSearch = search
      ? normalizeWhitespace(search).slice(0, CATALOG_CONSTANTS.MAX_SEARCH_LENGTH)
      : "";
    const services = normalizedSearch
      ? await catalogDal.searchPublicServices(
          business.id,
          normalizedSearch,
          toCompactSearchText(normalizedSearch),
        )
      : await catalogDal.listPublicServices(business.id);

    return { items: services };
  }

  /** Best online-bookable match for a service a customer described in words. */
  public async matchServiceByName(
    businessId: string,
    name: string,
  ): Promise<{ id: string; name: string } | null> {
    const search = normalizeWhitespace(name).slice(0, CATALOG_CONSTANTS.MAX_SEARCH_LENGTH);

    if (!search) return null;

    const [best] = await catalogDal.searchPublicServices(
      businessId,
      search,
      toCompactSearchText(search),
    );

    return best ? { id: best.id, name: best.name } : null;
  }

  /** An active, online-bookable service of this business, or null. */
  public async findBookableService(
    businessId: string,
    serviceId: string,
  ): Promise<{ id: string; name: string } | null> {
    if (!VALIDATION_PATTERNS.UUID.test(serviceId)) return null;

    const service = await catalogDal.findService(businessId, serviceId);

    return service?.isActive && service.onlineBookable
      ? { id: service.id, name: service.name }
      : null;
  }

  public async listBookableServiceNames(businessId: string, limit: number): Promise<string[]> {
    const services = await catalogDal.listPublicServices(businessId);

    return services.slice(0, limit).map((service) => service.name);
  }

  public toResponse(service: ServiceRecord): ServiceResponse {
    return {
      id: service.id,
      name: service.name,
      description: service.description,
      category: service.category,
      location: service.location,
      bookingType: service.bookingType,
      capacity: service.capacity,
      durationMinutes: service.durationMinutes,
      priceMinor: service.priceMinor,
      currency: service.currency,
      depositMinor: service.depositMinor,
      bufferBeforeMin: service.bufferBeforeMin,
      bufferAfterMin: service.bufferAfterMin,
      isActive: service.isActive,
      onlineBookable: service.onlineBookable,
      sortOrder: service.sortOrder,
      policyOverrides: parseServicePolicyOverrides(service.policyOverrides),
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
    };
  }

  private async prepareServiceData(
    businessId: string,
    input: ServiceWriteData,
  ): Promise<ServiceWriteData> {
    const name = normalizeWhitespace(input.name);
    const description = input.description?.trim() || null;

    if (
      name.length < CATALOG_CONSTANTS.MIN_SERVICE_NAME_LENGTH ||
      name.length > CATALOG_CONSTANTS.MAX_SERVICE_NAME_LENGTH
    ) {
      throwRequestValidationError("name", VALIDATION_MESSAGES.SERVICE_NAME);
    }

    if (description && description.length > CATALOG_CONSTANTS.MAX_DESCRIPTION_LENGTH) {
      throwRequestValidationError("description", VALIDATION_MESSAGES.SERVICE_DESCRIPTION);
    }

    this.assertIntegerInRange(
      "durationMinutes",
      input.durationMinutes,
      CATALOG_CONSTANTS.MIN_DURATION_MINUTES,
      CATALOG_CONSTANTS.MAX_DURATION_MINUTES,
      VALIDATION_MESSAGES.SERVICE_DURATION,
    );
    this.assertIntegerInRange(
      "priceMinor",
      input.priceMinor,
      0,
      CATALOG_CONSTANTS.MAX_PRICE_MINOR,
      VALIDATION_MESSAGES.SERVICE_PRICE,
    );

    if (
      input.depositMinor !== null &&
      (!Number.isInteger(input.depositMinor) ||
        input.depositMinor < 0 ||
        input.depositMinor > input.priceMinor)
    ) {
      throwRequestValidationError("depositMinor", VALIDATION_MESSAGES.SERVICE_DEPOSIT);
    }

    for (const field of ["bufferBeforeMin", "bufferAfterMin"] as const) {
      this.assertIntegerInRange(
        field,
        input[field],
        0,
        CATALOG_CONSTANTS.MAX_BUFFER_MINUTES,
        VALIDATION_MESSAGES.SERVICE_BUFFER,
      );
    }

    const maxCapacity =
      input.bookingType === "CLASS" ? CATALOG_CONSTANTS.MAX_CLASS_CAPACITY : 1;
    this.assertIntegerInRange(
      "capacity",
      input.capacity,
      1,
      maxCapacity,
      VALIDATION_MESSAGES.SERVICE_CAPACITY,
    );

    // Foreign keys alone would accept another business's category or location.
    if (input.categoryId) {
      assertUuid("categoryId", input.categoryId);
      if (!(await catalogDal.categoryExists(businessId, input.categoryId))) {
        this.throwCategoryNotFound();
      }
    }

    if (input.locationId) {
      assertUuid("locationId", input.locationId);
      if (!(await catalogDal.locationExists(businessId, input.locationId))) {
        throw new AppError(
          404,
          ERROR_CODES.LOCATION_NOT_FOUND,
          ERROR_MESSAGES.LOCATION_NOT_FOUND,
        );
      }
    }

    const overrides = servicePolicyOverridesSchema.safeParse(input.policyOverrides);

    if (!overrides.success) {
      throwRequestValidationError("policyOverrides", VALIDATION_MESSAGES.BUSINESS_SETTINGS);
    }

    return {
      ...input,
      name,
      description,
      policyOverrides: compactPolicyOverrides(overrides.data),
    };
  }

  private assertIntegerInRange(
    field: string,
    value: number,
    min: number,
    max: number,
    message: string,
  ): void {
    if (!Number.isInteger(value) || value < min || value > max) {
      throwRequestValidationError(field, message);
    }
  }

  private normalizeCategoryName(value: string): string {
    const name = normalizeWhitespace(value);

    if (name.length < 1 || name.length > CATALOG_CONSTANTS.MAX_CATEGORY_NAME_LENGTH) {
      throwRequestValidationError("name", VALIDATION_MESSAGES.SERVICE_CATEGORY_NAME);
    }

    return name;
  }

  private throwServiceNotFound(): never {
    throw new AppError(404, ERROR_CODES.SERVICE_NOT_FOUND, ERROR_MESSAGES.SERVICE_NOT_FOUND);
  }

  private throwCategoryNotFound(): never {
    throw new AppError(
      404,
      ERROR_CODES.SERVICE_CATEGORY_NOT_FOUND,
      ERROR_MESSAGES.SERVICE_CATEGORY_NOT_FOUND,
    );
  }

  private throwCategoryExists(): never {
    throw new AppError(
      409,
      ERROR_CODES.SERVICE_CATEGORY_ALREADY_EXISTS,
      ERROR_MESSAGES.SERVICE_CATEGORY_ALREADY_EXISTS,
      { name: [ERROR_MESSAGES.SERVICE_CATEGORY_ALREADY_EXISTS] },
    );
  }
}

export const catalogService = new CatalogService();
