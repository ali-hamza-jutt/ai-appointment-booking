import {
  ERROR_CODES,
  ERROR_MESSAGES,
  STAFF_CONSTANTS,
  VALIDATION_MESSAGES,
} from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import {
  isRecordNotFoundError,
  isUniqueConstraintError,
} from "../../utils/database.js";
import { assertUuid } from "../../utils/identifiers.js";
import { normalizeWhitespace } from "../../utils/text.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { resourceDal } from "./dal/resource.dal.js";
import { staffDal } from "./dal/staff.dal.js";
import type {
  CreateResourceRequest,
  ResourceListResponse,
  ResourceRecord,
  ResourceResponse,
  ResourceWriteData,
  UpdateResourceRequest,
} from "./dto/staff.dto.js";

export class ResourceService {
  public async listResources(businessId: string): Promise<ResourceListResponse> {
    const resources = await resourceDal.listResources(businessId);

    return { items: resources.map((resource) => this.toResponse(resource)) };
  }

  public async createResource(
    businessId: string,
    request: CreateResourceRequest,
  ): Promise<ResourceResponse> {
    const data = await this.prepareData(businessId, {
      name: request.name,
      locationId: request.locationId,
      capacity: request.capacity ?? 1,
      isActive: true,
    });
    const serviceIds = await this.prepareServiceIds(businessId, request.serviceIds ?? []);

    try {
      return this.toResponse(await resourceDal.createResource(businessId, data, serviceIds));
    } catch (error) {
      if (isUniqueConstraintError(error)) this.throwAlreadyExists();
      throw error;
    }
  }

  public async updateResource(
    businessId: string,
    resourceId: string,
    request: UpdateResourceRequest,
  ): Promise<ResourceResponse> {
    assertUuid("resourceId", resourceId);

    const current = await resourceDal.findResource(businessId, resourceId);

    if (!current) this.throwNotFound();

    const data = await this.prepareData(businessId, {
      name: request.name ?? current.name,
      locationId: request.locationId ?? current.location.id,
      capacity: request.capacity ?? current.capacity,
      isActive: request.isActive ?? current.isActive,
    });
    const serviceIds = request.serviceIds
      ? await this.prepareServiceIds(businessId, request.serviceIds)
      : undefined;

    try {
      return this.toResponse(
        await resourceDal.updateResource(businessId, resourceId, data, serviceIds),
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) this.throwAlreadyExists();
      if (isRecordNotFoundError(error)) this.throwNotFound();
      throw error;
    }
  }

  private async prepareData(
    businessId: string,
    input: ResourceWriteData,
  ): Promise<ResourceWriteData> {
    const name = normalizeWhitespace(input.name);

    if (name.length < 1 || name.length > STAFF_CONSTANTS.MAX_RESOURCE_NAME_LENGTH) {
      throwRequestValidationError("name", VALIDATION_MESSAGES.RESOURCE_NAME);
    }

    if (
      !Number.isInteger(input.capacity) ||
      input.capacity < 1 ||
      input.capacity > STAFF_CONSTANTS.MAX_RESOURCE_CAPACITY
    ) {
      throwRequestValidationError("capacity", VALIDATION_MESSAGES.RESOURCE_CAPACITY);
    }

    assertUuid("locationId", input.locationId);

    if ((await staffDal.countLocations(businessId, [input.locationId])) !== 1) {
      throw new AppError(
        404,
        ERROR_CODES.LOCATION_NOT_FOUND,
        ERROR_MESSAGES.LOCATION_NOT_FOUND,
      );
    }

    return { ...input, name };
  }

  private async prepareServiceIds(businessId: string, serviceIds: string[]): Promise<string[]> {
    const unique = [...new Set(serviceIds)];

    unique.forEach((serviceId) => assertUuid("serviceIds", serviceId));

    if (
      unique.length > STAFF_CONSTANTS.MAX_ASSIGNMENTS ||
      (unique.length > 0 &&
        (await staffDal.countServices(businessId, unique)) !== unique.length)
    ) {
      throwRequestValidationError("serviceIds", VALIDATION_MESSAGES.UNKNOWN_REFERENCES);
    }

    return unique;
  }

  private toResponse(resource: ResourceRecord): ResourceResponse {
    return {
      id: resource.id,
      name: resource.name,
      capacity: resource.capacity,
      isActive: resource.isActive,
      location: resource.location,
      services: resource.services.map((assignment) => assignment.service),
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
    };
  }

  private throwNotFound(): never {
    throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, ERROR_MESSAGES.RESOURCE_NOT_FOUND);
  }

  private throwAlreadyExists(): never {
    throw new AppError(
      409,
      ERROR_CODES.RESOURCE_ALREADY_EXISTS,
      ERROR_MESSAGES.RESOURCE_ALREADY_EXISTS,
      { name: [ERROR_MESSAGES.RESOURCE_ALREADY_EXISTS] },
    );
  }
}

export const resourceService = new ResourceService();
