import {
  CUSTOMER_PROFILE_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  VALIDATION_PATTERNS,
} from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import { customerProfileDal } from "./dal/customer-profile.dal.js";
import { customerDal } from "./dal/customer.dal.js";
import { customerService } from "./customer.service.js";
import type {
  AgentCustomerProfile,
  CustomerPreferenceKey,
  CustomerPreferenceRecord,
  CustomerPreferenceResponse,
  CustomerProfileResponse,
  MyPreferencesResponse,
  PartOfDay,
} from "./dto/customer-profile.dto.js";
import { derivePreferences } from "./preference-derivation.js";

const PART_OF_DAY_LABELS: Record<PartOfDay, string> = {
  morning: "Mornings",
  afternoon: "Afternoons",
  evening: "Evenings",
};

const ALL_KEYS: CustomerPreferenceKey[] = ["PREFERRED_STAFF", "USUAL_SERVICE", "PREFERRED_PART_OF_DAY"];

function isPartOfDay(value: string): value is PartOfDay {
  return (CUSTOMER_PROFILE_CONSTANTS.PARTS_OF_DAY as readonly string[]).includes(value);
}

/**
 * What a business remembers about a customer. Preferences are written only
 * by the customer's explicit request (through an agent tool) or derived
 * from completed visits; model output never becomes a preference directly.
 */
export class CustomerProfileService {
  /** The facts the booking agent starts a turn with; null for a first-time customer. */
  public async getAgentProfile(businessId: string, userId: string): Promise<AgentCustomerProfile | null> {
    const customerId = await customerProfileDal.findCustomerIdForUser(businessId, userId);

    if (!customerId) return null;

    const [records, visits, counts] = await Promise.all([
      customerProfileDal.listPreferences(businessId, customerId),
      customerProfileDal.listRecentVisits(
        businessId,
        customerId,
        CUSTOMER_PROFILE_CONSTANTS.RECENT_BOOKINGS_IN_CONTEXT,
      ),
      customerProfileDal.countVisits(businessId, customerId),
    ]);
    const preferences = await this.withLabels(businessId, records);

    return {
      customerId,
      completedVisits: counts.completed,
      preferences: preferences.map(({ key, value, label }) => ({ key, value, label })),
      recentBookings: visits.map((visit) => ({
        serviceName: visit.serviceName,
        staffName: visit.staff?.displayName ?? null,
        scheduledAt: visit.scheduledAt,
        timeZone: visit.timeZone,
        status: visit.status,
      })),
    };
  }

  /**
   * Saves a preference the customer asked for. The value must point at
   * something real: an active provider, a bookable service or a part of day.
   */
  public async rememberPreference(
    businessId: string,
    userId: string,
    key: CustomerPreferenceKey,
    value: string,
  ): Promise<CustomerPreferenceResponse> {
    const label = await this.labelFor(businessId, key, value);

    if (!label) {
      throw new AppError(
        422,
        ERROR_CODES.REQUEST_VALIDATION_FAILED,
        key === "PREFERRED_STAFF"
          ? "No such provider. Use list_staff to find the staffId."
          : key === "USUAL_SERVICE"
            ? "No such service. Use search_services to find the serviceId."
            : "Part of day must be morning, afternoon or evening.",
      );
    }

    const customerId = await customerProfileDal.resolveCustomerIdForUser(businessId, userId);

    if (!customerId) {
      throw new AppError(404, ERROR_CODES.CUSTOMER_NOT_FOUND, ERROR_MESSAGES.CUSTOMER_NOT_FOUND);
    }

    const record = await customerProfileDal.upsertPreference({
      businessId,
      customerId,
      key,
      value,
      source: "CUSTOMER",
    });

    return this.toResponse(record, label);
  }

  /** Forgets one preference; false when there was nothing to forget. */
  public async forgetPreference(
    businessId: string,
    userId: string,
    key: CustomerPreferenceKey,
  ): Promise<boolean> {
    const customerId = await customerProfileDal.findCustomerIdForUser(businessId, userId);

    return customerId ? customerProfileDal.deletePreference(businessId, customerId, key) : false;
  }

  /**
   * Re-derives preferences from completed visits. Safe to repeat: the result
   * depends only on the history, and customer-set preferences are untouched.
   */
  public async refreshFromHistory(businessId: string, customerId: string): Promise<void> {
    const visits = await customerProfileDal.listCompletedVisits(
      businessId,
      customerId,
      CUSTOMER_PROFILE_CONSTANTS.HISTORY_WINDOW,
    );
    const derived = derivePreferences(visits);

    for (const key of ALL_KEYS) {
      const value = derived[key];

      if (value) await customerProfileDal.upsertDerivedPreference(businessId, customerId, key, value);
    }

    await customerProfileDal.deleteDerivedPreferences(
      businessId,
      customerId,
      ALL_KEYS.filter((key) => !derived[key]),
    );
  }

  public async listMyPreferences(userId: string): Promise<MyPreferencesResponse> {
    const customers = await customerProfileDal.listPreferencesForUser(userId);
    const items = await Promise.all(
      customers
        .filter((customer) => customer.preferences.length > 0)
        .map(async (customer) => ({
          business: customer.business,
          preferences: await this.withLabels(customer.business.id, customer.preferences),
        })),
    );

    return { items: items.filter((item) => item.preferences.length > 0) };
  }

  public async deleteMyPreference(userId: string, preferenceId: string): Promise<void> {
    const owner = VALIDATION_PATTERNS.UUID.test(preferenceId)
      ? (await customerProfileDal.listPreferencesForUser(userId)).find((customer) =>
          customer.preferences.some((preference) => preference.id === preferenceId),
        )
      : undefined;
    const deleted = owner
      ? await customerProfileDal.deletePreferenceById(owner.customerId, preferenceId)
      : false;

    if (!deleted) {
      throw new AppError(
        404,
        ERROR_CODES.CUSTOMER_PREFERENCE_NOT_FOUND,
        ERROR_MESSAGES.CUSTOMER_PREFERENCE_NOT_FOUND,
      );
    }
  }

  /** A customer as the business's staff see them. */
  public async getCustomerProfile(businessId: string, customerId: string): Promise<CustomerProfileResponse> {
    const customer = VALIDATION_PATTERNS.UUID.test(customerId)
      ? await customerDal.findCustomer(businessId, customerId)
      : null;

    if (!customer) {
      throw new AppError(404, ERROR_CODES.CUSTOMER_NOT_FOUND, ERROR_MESSAGES.CUSTOMER_NOT_FOUND);
    }

    const [records, visits, counts] = await Promise.all([
      customerProfileDal.listPreferences(businessId, customerId),
      customerProfileDal.listRecentVisits(businessId, customerId, CUSTOMER_PROFILE_CONSTANTS.HISTORY_WINDOW),
      customerProfileDal.countVisits(businessId, customerId),
    ]);

    return {
      customer: customerService.toResponse(customer),
      preferences: await this.withLabels(businessId, records),
      completedVisits: counts.completed,
      noShows: counts.noShows,
      recentBookings: visits.map((visit) => ({
        bookingId: visit.id,
        serviceName: visit.serviceName,
        staffName: visit.staff?.displayName ?? null,
        scheduledAt: visit.scheduledAt,
        timeZone: visit.timeZone,
        status: visit.status,
      })),
    };
  }

  /**
   * Attaches display labels. A preference whose provider or service is no
   * longer bookable is left out rather than shown or given to the agent.
   */
  private async withLabels(
    businessId: string,
    records: CustomerPreferenceRecord[],
  ): Promise<CustomerPreferenceResponse[]> {
    const idsFor = (key: CustomerPreferenceKey) =>
      records.filter((record) => record.key === key).map((record) => record.value);
    const [staffNames, serviceNames] = await Promise.all([
      customerProfileDal.findActiveStaffNames(businessId, idsFor("PREFERRED_STAFF")),
      customerProfileDal.findBookableServiceNames(businessId, idsFor("USUAL_SERVICE")),
    ]);

    return records.flatMap((record) => {
      const label =
        record.key === "PREFERRED_STAFF"
          ? staffNames.get(record.value)
          : record.key === "USUAL_SERVICE"
            ? serviceNames.get(record.value)
            : isPartOfDay(record.value)
              ? PART_OF_DAY_LABELS[record.value]
              : undefined;

      return label ? [this.toResponse(record, label)] : [];
    });
  }

  private async labelFor(
    businessId: string,
    key: CustomerPreferenceKey,
    value: string,
  ): Promise<string | undefined> {
    if (key === "PREFERRED_PART_OF_DAY") {
      return isPartOfDay(value) ? PART_OF_DAY_LABELS[value] : undefined;
    }

    if (!VALIDATION_PATTERNS.UUID.test(value)) return undefined;

    const names =
      key === "PREFERRED_STAFF"
        ? await customerProfileDal.findActiveStaffNames(businessId, [value])
        : await customerProfileDal.findBookableServiceNames(businessId, [value]);

    return names.get(value);
  }

  private toResponse(record: CustomerPreferenceRecord, label: string): CustomerPreferenceResponse {
    return {
      id: record.id,
      key: record.key,
      value: record.value,
      label,
      source: record.source,
      updatedAt: record.updatedAt,
    };
  }
}

export const customerProfileService = new CustomerProfileService();
