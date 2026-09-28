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
import { normalizeEmail, normalizeWhitespace } from "../../utils/text.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { businessService } from "../businesses/business.service.js";
import { entitlements } from "../subscriptions/entitlements.js";
import { staffDal } from "./dal/staff.dal.js";
import type {
  CreateStaffRequest,
  PublicStaffListResponse,
  StaffAssignmentData,
  StaffListResponse,
  StaffProfileData,
  StaffRecord,
  StaffResponse,
  StaffServiceAssignment,
  UpdateStaffRequest,
} from "./dto/staff.dto.js";

export class StaffService {
  public async listStaff(businessId: string): Promise<StaffListResponse> {
    const staff = await staffDal.listStaff(businessId);

    return { items: staff.map((member) => this.toResponse(member)) };
  }

  public async getStaff(businessId: string, staffId: string): Promise<StaffResponse> {
    assertUuid("staffId", staffId);

    const staff = await staffDal.findStaff(businessId, staffId);

    if (!staff) this.throwStaffNotFound();

    return this.toResponse(staff);
  }

  public async createStaff(
    businessId: string,
    request: CreateStaffRequest,
  ): Promise<StaffResponse> {
    await entitlements.assertCanAddStaff(businessId);

    const profile = await this.prepareProfile(businessId, {
      displayName: request.displayName,
      email: request.email ?? null,
      bio: request.bio ?? null,
      avatarUrl: request.avatarUrl ?? null,
      userId: request.userId ?? null,
      isActive: true,
      sortOrder: request.sortOrder ?? 0,
    });
    const assignments = await this.prepareAssignments(businessId, {
      services: request.services ?? [],
      locationIds: request.locationIds ?? [],
    });

    try {
      const staff = await staffDal.createStaff(businessId, profile, {
        services: assignments.services ?? [],
        locationIds: assignments.locationIds ?? [],
      });

      return this.toResponse(staff);
    } catch (error) {
      if (isUniqueConstraintError(error)) this.throwAlreadyLinked();
      throw error;
    }
  }

  public async updateStaff(
    businessId: string,
    staffId: string,
    request: UpdateStaffRequest,
  ): Promise<StaffResponse> {
    assertUuid("staffId", staffId);

    const current = await staffDal.findStaff(businessId, staffId);

    if (!current) this.throwStaffNotFound();
    // Switching a provider back on takes a seat again.
    if (request.isActive === true && !current.isActive) await entitlements.assertCanAddStaff(businessId);

    const profile = await this.prepareProfile(businessId, {
      displayName: request.displayName ?? current.displayName,
      email: request.email !== undefined ? request.email : current.email,
      bio: request.bio !== undefined ? request.bio : current.bio,
      avatarUrl: request.avatarUrl !== undefined ? request.avatarUrl : current.avatarUrl,
      userId: request.userId !== undefined ? request.userId : current.userId,
      isActive: request.isActive ?? current.isActive,
      sortOrder: request.sortOrder ?? current.sortOrder,
    });
    const assignments = await this.prepareAssignments(businessId, {
      ...(request.services ? { services: request.services } : {}),
      ...(request.locationIds ? { locationIds: request.locationIds } : {}),
    });

    try {
      const staff = await staffDal.updateStaff(businessId, staffId, profile, assignments);
      return this.toResponse(staff);
    } catch (error) {
      if (isUniqueConstraintError(error)) this.throwAlreadyLinked();
      if (isRecordNotFoundError(error)) this.throwStaffNotFound();
      throw error;
    }
  }

  public async listPublicStaff(
    slug: string,
    serviceId?: string,
  ): Promise<PublicStaffListResponse> {
    const business = await businessService.getPublicBusiness(slug);

    if (serviceId) assertUuid("serviceId", serviceId);

    return { items: await staffDal.listPublicStaff(business.id, serviceId) };
  }

  public toResponse(staff: StaffRecord): StaffResponse {
    return {
      id: staff.id,
      userId: staff.userId,
      displayName: staff.displayName,
      email: staff.email,
      bio: staff.bio,
      avatarUrl: staff.avatarUrl,
      isActive: staff.isActive,
      sortOrder: staff.sortOrder,
      services: staff.services.map((assignment) => ({
        serviceId: assignment.service.id,
        serviceName: assignment.service.name,
        customDurationMinutes: assignment.customDurationMinutes,
        customPriceMinor: assignment.customPriceMinor,
      })),
      locations: staff.locations.map((assignment) => assignment.location),
      createdAt: staff.createdAt,
      updatedAt: staff.updatedAt,
    };
  }

  private async prepareProfile(
    businessId: string,
    input: StaffProfileData,
  ): Promise<StaffProfileData> {
    const displayName = normalizeWhitespace(input.displayName);
    const bio = input.bio?.trim() || null;
    const avatarUrl = input.avatarUrl?.trim() || null;

    if (
      displayName.length < STAFF_CONSTANTS.MIN_DISPLAY_NAME_LENGTH ||
      displayName.length > STAFF_CONSTANTS.MAX_DISPLAY_NAME_LENGTH
    ) {
      throwRequestValidationError("displayName", VALIDATION_MESSAGES.STAFF_DISPLAY_NAME);
    }

    if (bio && bio.length > STAFF_CONSTANTS.MAX_BIO_LENGTH) {
      throwRequestValidationError("bio", VALIDATION_MESSAGES.STAFF_BIO);
    }

    if (avatarUrl && !this.isHttpsUrl(avatarUrl)) {
      throwRequestValidationError("avatarUrl", VALIDATION_MESSAGES.STAFF_AVATAR_URL);
    }

    if (input.userId) {
      assertUuid("userId", input.userId);

      if (!(await staffDal.isBusinessMember(businessId, input.userId))) {
        throwRequestValidationError("userId", VALIDATION_MESSAGES.STAFF_MEMBER);
      }
    }

    return {
      ...input,
      displayName,
      bio,
      avatarUrl,
      email: input.email ? normalizeEmail(input.email) : null,
    };
  }

  private async prepareAssignments(
    businessId: string,
    input: { services?: StaffServiceAssignment[]; locationIds?: string[] },
  ): Promise<Partial<StaffAssignmentData>> {
    const result: Partial<StaffAssignmentData> = {};

    if (input.services) {
      const byService = new Map(
        input.services.map((service) => [service.serviceId, service]),
      );
      const serviceIds = [...byService.keys()];

      serviceIds.forEach((serviceId) => assertUuid("services", serviceId));
      await this.assertAllBelong(
        "services",
        serviceIds.length,
        () => staffDal.countServices(businessId, serviceIds),
      );

      result.services = [...byService.values()].map((service) => ({
        serviceId: service.serviceId,
        customDurationMinutes: service.customDurationMinutes ?? null,
        customPriceMinor: service.customPriceMinor ?? null,
      }));
    }

    if (input.locationIds) {
      const locationIds = [...new Set(input.locationIds)];

      locationIds.forEach((locationId) => assertUuid("locationIds", locationId));
      await this.assertAllBelong(
        "locationIds",
        locationIds.length,
        () => staffDal.countLocations(businessId, locationIds),
      );

      result.locationIds = locationIds;
    }

    return result;
  }

  private async assertAllBelong(
    field: string,
    expected: number,
    count: () => Promise<number>,
  ): Promise<void> {
    if (expected > STAFF_CONSTANTS.MAX_ASSIGNMENTS) {
      throwRequestValidationError(field, VALIDATION_MESSAGES.UNKNOWN_REFERENCES);
    }

    if (expected > 0 && (await count()) !== expected) {
      throwRequestValidationError(field, VALIDATION_MESSAGES.UNKNOWN_REFERENCES);
    }
  }

  private isHttpsUrl(value: string): boolean {
    if (value.length > STAFF_CONSTANTS.MAX_AVATAR_URL_LENGTH) return false;

    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }

  private throwStaffNotFound(): never {
    throw new AppError(404, ERROR_CODES.STAFF_NOT_FOUND, ERROR_MESSAGES.STAFF_NOT_FOUND);
  }

  private throwAlreadyLinked(): never {
    throw new AppError(
      409,
      ERROR_CODES.STAFF_ALREADY_LINKED,
      ERROR_MESSAGES.STAFF_ALREADY_LINKED,
      { userId: [ERROR_MESSAGES.STAFF_ALREADY_LINKED] },
    );
  }
}

export const staffService = new StaffService();
