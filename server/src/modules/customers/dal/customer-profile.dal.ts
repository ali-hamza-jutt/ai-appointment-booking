import { randomUUID } from "node:crypto";

import { prisma } from "../../../infrastructure/database/prisma.js";
import { bookingDal } from "../../bookings/dal/booking.dal.js";
import type {
  CustomerHistoryVisit,
  CustomerPreferenceKey,
  CustomerPreferenceRecord,
  CustomerVisitCounts,
  CustomerVisitRecord,
  UpsertCustomerPreferenceData,
  UserPreferencesRecord,
} from "../dto/customer-profile.dto.js";

export const customerPreferenceSelect = {
  id: true,
  businessId: true,
  customerId: true,
  key: true,
  value: true,
  source: true,
  updatedAt: true,
} as const;

/** Statuses that never became a real visit, so they are not history. */
const NOT_A_VISIT = ["HELD", "PENDING_PAYMENT", "EXPIRED"] as const;

export class CustomerProfileDal {
  public async findCustomerIdForUser(businessId: string, userId: string): Promise<string | null> {
    const customer = await prisma.customer.findFirst({
      where: { businessId, userId },
      select: { id: true },
    });

    return customer?.id ?? null;
  }

  /** The user's customer record at a business, created or linked on first use. */
  public async resolveCustomerIdForUser(businessId: string, userId: string): Promise<string | null> {
    const user = await bookingDal.findUser(userId);

    if (!user) return null;

    return prisma.$transaction((transaction) =>
      bookingDal.resolveCustomerForUser(transaction, businessId, user),
    );
  }

  public listPreferences(businessId: string, customerId: string): Promise<CustomerPreferenceRecord[]> {
    return prisma.customerPreference.findMany({
      where: { businessId, customerId },
      orderBy: { key: "asc" },
      select: customerPreferenceSelect,
    });
  }

  /** A preference the customer asked for; replaces whatever was there. */
  public upsertPreference(data: UpsertCustomerPreferenceData): Promise<CustomerPreferenceRecord> {
    return prisma.customerPreference.upsert({
      where: { customerId_key: { customerId: data.customerId, key: data.key } },
      create: data,
      update: { value: data.value, source: data.source },
      select: customerPreferenceSelect,
    });
  }

  /**
   * A preference derived from history. It never replaces one the customer
   * asked for, and the check happens inside the same statement.
   */
  public async upsertDerivedPreference(
    businessId: string,
    customerId: string,
    key: CustomerPreferenceKey,
    value: string,
  ): Promise<void> {
    await prisma.$executeRaw`
      INSERT INTO "customer_preferences" ("id", "business_id", "customer_id", "key", "value", "source", "updated_at")
      VALUES (${randomUUID()}::uuid, ${businessId}::uuid, ${customerId}::uuid,
              ${key}::"customer_preference_key", ${value}, 'BOOKING_HISTORY', CURRENT_TIMESTAMP)
      ON CONFLICT ("customer_id", "key") DO UPDATE
        SET "value" = EXCLUDED."value", "updated_at" = CURRENT_TIMESTAMP
        WHERE "customer_preferences"."source" = 'BOOKING_HISTORY'
          AND "customer_preferences"."value" <> EXCLUDED."value"
    `;
  }

  /** Drops derived preferences the history no longer supports. */
  public async deleteDerivedPreferences(
    businessId: string,
    customerId: string,
    keys: CustomerPreferenceKey[],
  ): Promise<void> {
    if (keys.length === 0) return;

    await prisma.customerPreference.deleteMany({
      where: { businessId, customerId, key: { in: keys }, source: "BOOKING_HISTORY" },
    });
  }

  public async deletePreference(
    businessId: string,
    customerId: string,
    key: CustomerPreferenceKey,
  ): Promise<boolean> {
    const { count } = await prisma.customerPreference.deleteMany({
      where: { businessId, customerId, key },
    });

    return count > 0;
  }

  public async deletePreferenceById(customerId: string, preferenceId: string): Promise<boolean> {
    const { count } = await prisma.customerPreference.deleteMany({
      where: { customerId, id: preferenceId },
    });

    return count > 0;
  }

  /** Completed visits, newest first. */
  public listCompletedVisits(
    businessId: string,
    customerId: string,
    take: number,
  ): Promise<CustomerHistoryVisit[]> {
    return prisma.booking.findMany({
      where: { businessId, customerId, status: "COMPLETED" },
      orderBy: [{ scheduledAt: "desc" }, { id: "desc" }],
      take,
      select: { serviceId: true, staffId: true, scheduledAt: true, timeZone: true },
    });
  }

  /** Real bookings (past or upcoming), newest first. */
  public listRecentVisits(
    businessId: string,
    customerId: string,
    take: number,
  ): Promise<CustomerVisitRecord[]> {
    return prisma.booking.findMany({
      where: { businessId, customerId, status: { notIn: [...NOT_A_VISIT] } },
      orderBy: [{ scheduledAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        serviceName: true,
        scheduledAt: true,
        timeZone: true,
        status: true,
        staff: { select: { displayName: true } },
      },
    });
  }

  public async countVisits(businessId: string, customerId: string): Promise<CustomerVisitCounts> {
    const [completed, noShows] = await Promise.all([
      prisma.booking.count({ where: { businessId, customerId, status: "COMPLETED" } }),
      prisma.booking.count({ where: { businessId, customerId, status: "NO_SHOW" } }),
    ]);

    return { completed, noShows };
  }

  /** Names of active staff, by id. */
  public async findActiveStaffNames(businessId: string, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();

    const staff = await prisma.staff.findMany({
      where: { businessId, id: { in: ids }, isActive: true },
      select: { id: true, displayName: true },
    });

    return new Map(staff.map((member) => [member.id, member.displayName]));
  }

  /** Names of services customers can still book online, by id. */
  public async findBookableServiceNames(businessId: string, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();

    const services = await prisma.service.findMany({
      where: { businessId, id: { in: ids }, isActive: true, onlineBookable: true },
      select: { id: true, name: true },
    });

    return new Map(services.map((service) => [service.id, service.name]));
  }

  /** Every business's preferences for one user, reached through their own account. */
  public async listPreferencesForUser(userId: string): Promise<UserPreferencesRecord[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        customers: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            business: { select: { id: true, name: true, slug: true } },
            preferences: { orderBy: { key: "asc" }, select: customerPreferenceSelect },
          },
        },
      },
    });

    return (user?.customers ?? []).map((customer) => ({
      customerId: customer.id,
      business: customer.business,
      preferences: customer.preferences,
    }));
  }
}

export const customerProfileDal = new CustomerProfileDal();
