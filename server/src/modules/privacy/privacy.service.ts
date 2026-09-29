import { logger } from "../../config/logger.js";
import { ERROR_CODES, ERROR_MESSAGES, PRIVACY_CONSTANTS, VALIDATION_PATTERNS } from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import { normalizeEmail } from "../../utils/text.js";
import { parseStoredBusinessSettings } from "../businesses/business-settings.js";
import { privacyDal, type CustomerRow } from "./dal/privacy.dal.js";
import type { CustomerDataExport, MyDataExport } from "./dto/privacy.dto.js";

const DAY = 24 * 60 * 60 * 1_000;

/**
 * GDPR requests and data retention. A business can export or erase what it
 * holds about one customer; a person can export everything BookWise holds
 * about them and delete their account; and chats older than a business's
 * retention period are deleted nightly.
 */
export class PrivacyService {
  public async exportCustomer(businessId: string, customerId: string, now: Date = new Date()): Promise<CustomerDataExport> {
    return this.exportOf(await this.getCustomer(businessId, customerId), now);
  }

  /** Erases a customer's personal details at this business; refused while they have appointments ahead. */
  public async eraseCustomer(businessId: string, customerId: string, now: Date = new Date()): Promise<void> {
    const customer = await this.getCustomer(businessId, customerId);

    if ((await privacyDal.countUpcoming(businessId, customer.id, now)) > 0) {
      throw new AppError(409, ERROR_CODES.UPCOMING_BOOKINGS_EXIST, ERROR_MESSAGES.UPCOMING_BOOKINGS_EXIST);
    }

    await privacyDal.erase(customer, PRIVACY_CONSTANTS.ERASED_CUSTOMER_NAME);
    logger.info({ businessId, customerId }, "Customer data erased");
  }

  public async exportMine(userId: string, now: Date = new Date()): Promise<MyDataExport> {
    const user = await privacyDal.findUser(userId);

    if (!user) throw new AppError(404, ERROR_CODES.USER_NOT_FOUND, ERROR_MESSAGES.USER_NOT_FOUND);

    const customers = await privacyDal.customersOfUser(userId);

    return {
      account: user,
      businesses: await Promise.all(customers.map((customer) => this.exportOf(customer, now))),
      exportedAt: now,
    };
  }

  /**
   * Deletes the account: its details are erased at every business it booked
   * with, then the account itself goes, taking its chats, reviews, sessions
   * and browsers with it. Bookings stay with each business, anonymously.
   */
  public async deleteMyAccount(userId: string, confirmEmail: string, now: Date = new Date()): Promise<void> {
    const user = await privacyDal.findUser(userId);

    if (!user) throw new AppError(404, ERROR_CODES.USER_NOT_FOUND, ERROR_MESSAGES.USER_NOT_FOUND);
    if (normalizeEmail(confirmEmail) !== user.email) {
      throw new AppError(422, ERROR_CODES.ACCOUNT_DELETION_NOT_CONFIRMED, ERROR_MESSAGES.ACCOUNT_DELETION_NOT_CONFIRMED, {
        confirmEmail: [ERROR_MESSAGES.ACCOUNT_DELETION_NOT_CONFIRMED],
      });
    }

    if ((await privacyDal.businessesOnlyOwnedBy(userId)).length > 0) {
      throw new AppError(409, ERROR_CODES.SOLE_OWNER, ERROR_MESSAGES.SOLE_OWNER);
    }

    const customers = await privacyDal.customersOfUser(userId);

    for (const customer of customers) {
      if ((await privacyDal.countUpcoming(customer.businessId, customer.id, now)) > 0) {
        throw new AppError(409, ERROR_CODES.UPCOMING_BOOKINGS_EXIST, ERROR_MESSAGES.UPCOMING_BOOKINGS_EXIST);
      }
    }

    for (const customer of customers) await privacyDal.erase(customer, PRIVACY_CONSTANTS.ERASED_CUSTOMER_NAME);

    await privacyDal.deleteUser(userId);
    logger.info({ userId }, "Account deleted at the user's request");
  }

  /** The nightly job: deletes chats each business's retention period says are too old. */
  public async purgeOldChats(now: Date = new Date()): Promise<number> {
    let deleted = 0;

    for (const business of await privacyDal.listBusinessSettings()) {
      const days = parseStoredBusinessSettings(business.settings).chatRetentionDays;

      if (days > 0) deleted += await privacyDal.deleteChatsUntouchedSince(business.id, new Date(now.getTime() - days * DAY));
    }

    return deleted;
  }

  private async getCustomer(businessId: string, customerId: string): Promise<CustomerRow> {
    const customer = VALIDATION_PATTERNS.UUID.test(customerId) ? await privacyDal.findCustomer(businessId, customerId) : null;

    if (!customer) throw new AppError(404, ERROR_CODES.CUSTOMER_NOT_FOUND, ERROR_MESSAGES.CUSTOMER_NOT_FOUND);

    return customer;
  }

  private async exportOf(customer: CustomerRow, now: Date): Promise<CustomerDataExport> {
    const data = await privacyDal.collect(customer);

    return {
      business: customer.business,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        notes: customer.notes,
        createdAt: customer.createdAt,
      },
      bookings: data.bookings.map(({ staff, ...booking }) => ({ ...booking, staffName: staff?.displayName ?? null })),
      chats: data.chats,
      reviews: data.reviews,
      waitlist: data.waitlist.map((entry) => ({
        serviceName: entry.service.name,
        fromDate: entry.fromDate.toISOString().slice(0, 10),
        toDate: entry.toDate.toISOString().slice(0, 10),
        status: entry.status,
        createdAt: entry.createdAt,
      })),
      preferences: data.preferences,
      notifications: data.notifications,
      exportedAt: now,
    };
  }
}

export const privacyService = new PrivacyService();
