import { randomBytes } from "node:crypto";

import {
  BUSINESS_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  VALIDATION_MESSAGES,
} from "../../constants/app.constants.js";
import { BUSINESS_VERTICALS } from "../../constants/business-verticals.constants.js";
import { AppError } from "../../middleware/app-error.js";
import { normalizeCurrencyCode } from "../../utils/currency.js";
import {
  isRecordNotFoundError,
  isUniqueConstraintError,
} from "../../utils/database.js";
import { assertUuid } from "../../utils/identifiers.js";
import { normalizeWhitespace, slugify } from "../../utils/text.js";
import { normalizeIanaTimeZone } from "../../utils/time-zone.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import {
  businessSettingsSchema,
  mergeBusinessSettings,
  parseStoredBusinessSettings,
} from "./business-settings.js";
import { businessDal } from "./dal/business.dal.js";
import { locationDal } from "./dal/location.dal.js";
import type {
  BusinessListResponse,
  BusinessRecord,
  BusinessResponse,
  BusinessVertical,
  BusinessVerticalListResponse,
  CreateBusinessRequest,
  PublicBusinessRecord,
  PublicBusinessResponse,
  CreateLocationRequest,
  LocationListResponse,
  LocationRecord,
  LocationResponse,
  MembershipRole,
  UpdateBusinessData,
  UpdateBusinessRequest,
  UpdateBusinessSettingsRequest,
  UpdateLocationData,
  UpdateLocationRequest,
} from "./dto/business.dto.js";

export class BusinessService {
  public listVerticals(): BusinessVerticalListResponse {
    return {
      items: Object.entries(BUSINESS_VERTICALS).map(([id, vertical]) => ({
        id: id as BusinessVertical,
        label: vertical.label,
        description: vertical.description,
        providerLabel: vertical.providerLabel,
        customerLabel: vertical.customerLabel,
        supportsClasses: vertical.supportsClasses,
        suggestedServices: [...vertical.suggestedServices],
      })),
    };
  }

  public async createBusiness(
    userId: string,
    request: CreateBusinessRequest,
  ): Promise<BusinessResponse> {
    const name = this.normalizeName(request.name, "name", VALIDATION_MESSAGES.BUSINESS_NAME);
    const timeZone = this.normalizeTimeZone(request.timeZone);
    const currency = this.normalizeCurrency(
      request.currency ?? BUSINESS_CONSTANTS.DEFAULT_CURRENCY,
    );
    const explicitSlug = request.slug ? this.normalizeSlug(request.slug) : null;
    const baseSlug =
      explicitSlug ??
      (slugify(name, BUSINESS_CONSTANTS.MAX_SLUG_LENGTH -
        BUSINESS_CONSTANTS.SLUG_SUFFIX_LENGTH - 1) || "business");
    const location = {
      name: request.location
        ? this.normalizeName(
            request.location.name,
            "location.name",
            VALIDATION_MESSAGES.LOCATION_NAME,
          )
        : BUSINESS_CONSTANTS.DEFAULT_LOCATION_NAME,
      address: this.normalizeAddress(request.location?.address),
      timeZone,
    };

    for (let attempt = 0; attempt < BUSINESS_CONSTANTS.MAX_SLUG_ATTEMPTS; attempt += 1) {
      const slug =
        attempt === 0 ? baseSlug : `${baseSlug}-${this.randomSlugSuffix()}`;

      try {
        const business = await businessDal.createBusiness({
          ownerUserId: userId,
          slug,
          name,
          vertical: request.vertical,
          timeZone,
          currency,
          settings: businessSettingsSchema.parse({}),
          location,
        });

        return this.toResponse(business, "OWNER");
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        if (explicitSlug) this.throwSlugTaken();
      }
    }

    this.throwSlugTaken();
  }

  public async listMyBusinesses(userId: string): Promise<BusinessListResponse> {
    const memberships = await businessDal.listBusinessesForUser(userId);

    return {
      items: memberships.map((membership) => ({
        ...membership.business,
        role: membership.role,
      })),
    };
  }

  /** Resolves a public booking link; used by customer-facing routes. */
  public async getPublicBusiness(slug: string): Promise<PublicBusinessRecord> {
    const business = await businessDal.findPublicBusinessBySlug(
      slug.trim().toLowerCase(),
    );

    if (!business) this.throwBusinessNotFound();

    return business;
  }

  public toPublicResponse(business: PublicBusinessRecord): PublicBusinessResponse {
    return {
      id: business.id,
      slug: business.slug,
      name: business.name,
      vertical: business.vertical,
      timeZone: business.timeZone,
      currency: business.currency,
      allowGuestBooking: parseStoredBusinessSettings(business.settings)
        .allowGuestBooking,
    };
  }

  public async getBusiness(
    businessId: string,
    role: MembershipRole | null,
  ): Promise<BusinessResponse> {
    const business = await businessDal.findBusinessById(businessId);

    if (!business) this.throwBusinessNotFound();

    return this.toResponse(business, role);
  }

  public async updateBusiness(
    businessId: string,
    role: MembershipRole | null,
    request: UpdateBusinessRequest,
  ): Promise<BusinessResponse> {
    const data: UpdateBusinessData = {
      ...(request.name !== undefined
        ? {
            name: this.normalizeName(
              request.name,
              "name",
              VALIDATION_MESSAGES.BUSINESS_NAME,
            ),
          }
        : {}),
      ...(request.vertical !== undefined ? { vertical: request.vertical } : {}),
      ...(request.timeZone !== undefined
        ? { timeZone: this.normalizeTimeZone(request.timeZone) }
        : {}),
      ...(request.currency !== undefined
        ? { currency: this.normalizeCurrency(request.currency) }
        : {}),
      ...(request.slug !== undefined
        ? { slug: this.normalizeSlug(request.slug) }
        : {}),
    };

    try {
      const business = await businessDal.updateBusiness(businessId, data);
      return this.toResponse(business, role);
    } catch (error) {
      if (isUniqueConstraintError(error)) this.throwSlugTaken();
      if (isRecordNotFoundError(error)) this.throwBusinessNotFound();
      throw error;
    }
  }

  public async updateSettings(
    businessId: string,
    role: MembershipRole | null,
    request: UpdateBusinessSettingsRequest,
  ): Promise<BusinessResponse> {
    const business = await businessDal.findBusinessById(businessId);

    if (!business) this.throwBusinessNotFound();

    const settings = mergeBusinessSettings(
      parseStoredBusinessSettings(business.settings),
      request,
    );
    const updated = await businessDal.updateBusiness(businessId, { settings });

    return this.toResponse(updated, role);
  }

  public async listLocations(businessId: string): Promise<LocationListResponse> {
    const locations = await locationDal.listLocations(businessId);

    return { items: locations.map((location) => this.toLocationResponse(location)) };
  }

  public async createLocation(
    businessId: string,
    request: CreateLocationRequest,
  ): Promise<LocationResponse> {
    const business = await businessDal.findBusinessById(businessId);

    if (!business) this.throwBusinessNotFound();

    const location = await locationDal.createLocation({
      businessId,
      name: this.normalizeName(
        request.name,
        "name",
        VALIDATION_MESSAGES.LOCATION_NAME,
      ),
      address: this.normalizeAddress(request.address),
      timeZone: request.timeZone
        ? this.normalizeTimeZone(request.timeZone)
        : business.timeZone,
    });

    return this.toLocationResponse(location);
  }

  public async updateLocation(
    businessId: string,
    locationId: string,
    request: UpdateLocationRequest,
  ): Promise<LocationResponse> {
    assertUuid("locationId", locationId);

    const data: UpdateLocationData = {
      ...(request.name !== undefined
        ? {
            name: this.normalizeName(
              request.name,
              "name",
              VALIDATION_MESSAGES.LOCATION_NAME,
            ),
          }
        : {}),
      ...(request.address !== undefined
        ? { address: this.normalizeAddress(request.address) }
        : {}),
      ...(request.timeZone !== undefined
        ? { timeZone: this.normalizeTimeZone(request.timeZone) }
        : {}),
      ...(request.isActive !== undefined ? { isActive: request.isActive } : {}),
    };

    try {
      const location = await locationDal.updateLocation(businessId, locationId, data);
      return this.toLocationResponse(location);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new AppError(
          404,
          ERROR_CODES.LOCATION_NOT_FOUND,
          ERROR_MESSAGES.LOCATION_NOT_FOUND,
        );
      }

      throw error;
    }
  }

  public toResponse(
    business: BusinessRecord,
    role: MembershipRole | null,
  ): BusinessResponse {
    return {
      id: business.id,
      slug: business.slug,
      name: business.name,
      vertical: business.vertical,
      timeZone: business.timeZone,
      currency: business.currency,
      settings: parseStoredBusinessSettings(business.settings),
      role,
      suspension: business.suspendedAt ? { at: business.suspendedAt, reason: business.suspendedReason } : null,
      createdAt: business.createdAt,
      updatedAt: business.updatedAt,
    };
  }

  private toLocationResponse(location: LocationRecord): LocationResponse {
    return {
      id: location.id,
      name: location.name,
      address: location.address,
      timeZone: location.timeZone,
      isActive: location.isActive,
      createdAt: location.createdAt,
      updatedAt: location.updatedAt,
    };
  }

  private normalizeName(value: string, field: string, message: string): string {
    const name = normalizeWhitespace(value);

    if (
      name.length < BUSINESS_CONSTANTS.MIN_NAME_LENGTH ||
      name.length > BUSINESS_CONSTANTS.MAX_NAME_LENGTH
    ) {
      throwRequestValidationError(field, message);
    }

    return name;
  }

  private normalizeAddress(value: string | null | undefined): string | null {
    const address = value ? normalizeWhitespace(value) : "";

    if (address.length > BUSINESS_CONSTANTS.MAX_ADDRESS_LENGTH) {
      throwRequestValidationError("address", VALIDATION_MESSAGES.LOCATION_ADDRESS);
    }

    return address || null;
  }

  private normalizeTimeZone(value: string): string {
    const timeZone = normalizeIanaTimeZone(value);

    if (!timeZone) {
      throwRequestValidationError("timeZone", VALIDATION_MESSAGES.BUSINESS_TIME_ZONE);
    }

    return timeZone;
  }

  private normalizeCurrency(value: string): string {
    const currency = normalizeCurrencyCode(value);

    if (!currency) {
      throwRequestValidationError("currency", VALIDATION_MESSAGES.BUSINESS_CURRENCY);
    }

    return currency;
  }

  private normalizeSlug(value: string): string {
    const slug = value.trim().toLowerCase();

    if (!BUSINESS_CONSTANTS.SLUG_PATTERN.test(slug)) {
      throwRequestValidationError("slug", VALIDATION_MESSAGES.BUSINESS_SLUG);
    }

    return slug;
  }

  private randomSlugSuffix(): string {
    return randomBytes(BUSINESS_CONSTANTS.SLUG_SUFFIX_LENGTH)
      .toString("hex")
      .slice(0, BUSINESS_CONSTANTS.SLUG_SUFFIX_LENGTH);
  }

  private throwSlugTaken(): never {
    throw new AppError(
      409,
      ERROR_CODES.BUSINESS_SLUG_TAKEN,
      ERROR_MESSAGES.BUSINESS_SLUG_TAKEN,
      { slug: [ERROR_MESSAGES.BUSINESS_SLUG_TAKEN] },
    );
  }

  private throwBusinessNotFound(): never {
    throw new AppError(
      404,
      ERROR_CODES.BUSINESS_NOT_FOUND,
      ERROR_MESSAGES.BUSINESS_NOT_FOUND,
    );
  }
}

export const businessService = new BusinessService();
