import {
  BUSINESS_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  VALIDATION_MESSAGES,
  VALIDATION_PATTERNS,
} from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import { isUniqueConstraintError } from "../../utils/database.js";
import {
  decodeTimestampCursor,
  encodeTimestampCursor,
} from "../../utils/pagination.js";
import { normalizeEmail, normalizeWhitespace } from "../../utils/text.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { customerDal } from "./dal/customer.dal.js";
import type {
  CreateCustomerRequest,
  CustomerListResponse,
  CustomerRecord,
  CustomerResponse,
  ListCustomersOptions,
} from "./dto/customer.dto.js";

const CUSTOMER_NOTES_MAX_LENGTH = 2_000;

export class CustomerService {
  public async createCustomer(
    businessId: string,
    request: CreateCustomerRequest,
  ): Promise<CustomerResponse> {
    const name = normalizeWhitespace(request.name);

    if (
      name.length < BUSINESS_CONSTANTS.MIN_NAME_LENGTH ||
      name.length > BUSINESS_CONSTANTS.MAX_NAME_LENGTH
    ) {
      throwRequestValidationError("name", VALIDATION_MESSAGES.CUSTOMER_NAME);
    }

    const phone = request.phone ? normalizeWhitespace(request.phone) : null;

    if (phone && !BUSINESS_CONSTANTS.PHONE_PATTERN.test(phone)) {
      throwRequestValidationError("phone", VALIDATION_MESSAGES.CUSTOMER_PHONE);
    }

    try {
      const customer = await customerDal.createCustomer({
        businessId,
        name,
        email: request.email ? normalizeEmail(request.email) : null,
        phone,
      });

      return this.toResponse(customer);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(
          409,
          ERROR_CODES.CUSTOMER_ALREADY_EXISTS,
          ERROR_MESSAGES.CUSTOMER_ALREADY_EXISTS,
          { email: [ERROR_MESSAGES.CUSTOMER_ALREADY_EXISTS] },
        );
      }

      throw error;
    }
  }

  public async listCustomers(
    businessId: string,
    options: ListCustomersOptions,
  ): Promise<CustomerListResponse> {
    const limit = options.limit ?? BUSINESS_CONSTANTS.DEFAULT_PAGE_SIZE;

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > BUSINESS_CONSTANTS.MAX_PAGE_SIZE
    ) {
      throwRequestValidationError("limit", VALIDATION_MESSAGES.PAGINATION_LIMIT);
    }

    const decodedCursor = options.cursor
      ? decodeTimestampCursor(options.cursor)
      : undefined;

    if (options.cursor && !decodedCursor) {
      throw new AppError(
        422,
        ERROR_CODES.INVALID_PAGINATION_CURSOR,
        ERROR_MESSAGES.INVALID_PAGINATION_CURSOR,
        { cursor: [ERROR_MESSAGES.INVALID_PAGINATION_CURSOR] },
      );
    }

    const search = options.search
      ? normalizeWhitespace(options.search).slice(
          0,
          BUSINESS_CONSTANTS.MAX_CUSTOMER_SEARCH_LENGTH,
        )
      : "";
    const records = await customerDal.listCustomers({
      businessId,
      ...(search ? { search } : {}),
      ...(decodedCursor
        ? {
            cursor: {
              createdAt: decodedCursor.timestamp,
              id: decodedCursor.id,
            },
          }
        : {}),
      take: limit + 1,
    });
    const hasMore = records.length > limit;
    const page = hasMore ? records.slice(0, limit) : records;
    const lastRecord = page.at(-1);

    return {
      items: page.map((customer) => this.toResponse(customer)),
      ...(hasMore && lastRecord
        ? {
            nextCursor: encodeTimestampCursor(lastRecord.id, lastRecord.createdAt),
          }
        : {}),
    };
  }

  /** Replaces the team's private notes about a customer. */
  public async updateNotes(businessId: string, customerId: string, notes: string | null): Promise<void> {
    const trimmed = notes?.trim() || null;

    if (trimmed && trimmed.length > CUSTOMER_NOTES_MAX_LENGTH) {
      throwRequestValidationError("notes", "Notes can be at most 2000 characters");
    }

    const found = VALIDATION_PATTERNS.UUID.test(customerId) && (await customerDal.updateNotes(businessId, customerId, trimmed));

    if (!found) throw new AppError(404, ERROR_CODES.CUSTOMER_NOT_FOUND, ERROR_MESSAGES.CUSTOMER_NOT_FOUND);
  }

  public toResponse(customer: CustomerRecord): CustomerResponse {
    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      hasAccount: customer.userId !== null,
      createdAt: customer.createdAt,
    };
  }
}

export const customerService = new CustomerService();
