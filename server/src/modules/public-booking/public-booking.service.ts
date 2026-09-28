import {
  AUTH_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  PUBLIC_BOOKING_CONSTANTS,
  VALIDATION_PATTERNS,
} from "../../constants/app.constants.js";
import { mailer, type Mailer } from "../../infrastructure/messaging/mailer.js";
import { AppError } from "../../middleware/app-error.js";
import { isUniqueConstraintError } from "../../utils/database.js";
import { createNumericCode, hashSecret, secretMatches } from "../../utils/secure-token.js";
import { normalizeEmail, normalizeWhitespace } from "../../utils/text.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { authDal } from "../auth/dal/auth.dal.js";
import type { AuthSession } from "../auth/dto/auth.dto.js";
import { normalizePhoneNumber } from "../auth/phone-auth.service.js";
import { sessionService } from "../auth/session.service.js";
import { parseStoredBusinessSettings } from "../businesses/business-settings.js";
import { businessService } from "../businesses/business.service.js";
import { customerProfileDal } from "../customers/dal/customer-profile.dal.js";
import { publicBookingDal } from "./dal/public-booking.dal.js";
import type {
  AllowedOriginListResponse,
  AllowedOriginResponse,
  EmbedPolicyResponse,
  GuestVerifyRequest,
} from "./dto/public-booking.dto.js";

const MINUTE = 60_000;

/** "https://Glowsalon.com/book?x" → "https://glowsalon.com"; null for anything but a web origin. */
export function toWebOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());

    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // Plain http is only for trying the widget out locally.
    if (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return null;

    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Booking from a business's public page or widget. A guest proves their
 * email with a one-time code and gets an account behind the scenes, so the
 * rest of the flow uses the same session, holds and chat as signed-in users.
 */
export class PublicBookingService {
  public constructor(private readonly email: Mailer = mailer) {}

  /** Emails a 6-digit code. Asking again within a minute is refused. */
  public async sendGuestCode(slug: string, emailInput: string, now: Date = new Date()): Promise<void> {
    const business = await this.getGuestBusiness(slug);
    const key = { email: normalizeEmail(emailInput), businessId: business.id };
    const latest = await publicBookingDal.findLatestCode(key);

    if (latest && now.getTime() - latest.createdAt.getTime() < PUBLIC_BOOKING_CONSTANTS.GUEST_CODE_RESEND_SECONDS * 1_000) {
      throw new AppError(429, ERROR_CODES.GUEST_CODE_RECENTLY_SENT, ERROR_MESSAGES.GUEST_CODE_RECENTLY_SENT);
    }

    const code = createNumericCode(AUTH_CONSTANTS.PHONE_CODE_LENGTH);
    const minutes = PUBLIC_BOOKING_CONSTANTS.GUEST_CODE_TTL_MINUTES;

    await publicBookingDal.replaceCode(key, hashSecret(code), new Date(now.getTime() + minutes * MINUTE));
    await this.email.send({
      to: key.email,
      subject: `${code} is your code for ${business.name}`,
      text: [
        `Your code to book with ${business.name} is ${code}.`,
        "",
        `It works for ${minutes} minutes. If you didn't ask for it, you can ignore this email.`,
      ].join("\n"),
    });
  }

  /**
   * Checks the code and signs the guest in, creating their account the first
   * time. An existing account is signed in as it is: the code proves the
   * email belongs to them.
   */
  public async verifyGuest(
    slug: string,
    request: GuestVerifyRequest,
    options: { userAgent: string | null },
    now: Date = new Date(),
  ): Promise<AuthSession> {
    const business = await this.getGuestBusiness(slug);
    const email = normalizeEmail(request.email);
    const name = normalizeWhitespace(request.name);
    const phone = request.phone ? normalizePhoneNumber(request.phone) : null;

    if (name.length < 2 || name.length > 80) throwRequestValidationError("name", "Enter your name");

    await this.checkCode({ email, businessId: business.id }, request.code, now);

    const user = (await authDal.findUserByEmail(email)) ?? (await this.createGuestUser(email, name, now));

    if (phone) {
      const customerId = await customerProfileDal.resolveCustomerIdForUser(business.id, user.id);

      if (customerId) await publicBookingDal.setCustomerPhoneIfMissing(business.id, customerId, phone);
    }

    // A guest on a shared or embedded browser shouldn't stay signed in for weeks.
    return sessionService.startSession(user, { persistent: false, userAgent: options.userAgent });
  }

  public async listOrigins(businessId: string): Promise<AllowedOriginListResponse> {
    return { items: await publicBookingDal.listOrigins(businessId) };
  }

  public async addOrigin(businessId: string, input: string): Promise<AllowedOriginResponse> {
    const origin = toWebOrigin(input);

    if (!origin) throwRequestValidationError("origin", "Enter a website address such as https://example.com");

    const existing = await publicBookingDal.findOrigin(businessId, origin);

    if (existing) return existing;
    if ((await publicBookingDal.countOrigins(businessId)) >= PUBLIC_BOOKING_CONSTANTS.MAX_ALLOWED_ORIGINS) {
      throw new AppError(409, ERROR_CODES.ALLOWED_ORIGIN_LIMIT_REACHED, ERROR_MESSAGES.ALLOWED_ORIGIN_LIMIT_REACHED);
    }

    try {
      return await publicBookingDal.createOrigin(businessId, origin);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;

      return (await publicBookingDal.findOrigin(businessId, origin)) as AllowedOriginResponse;
    }
  }

  public async removeOrigin(businessId: string, originId: string): Promise<void> {
    const removed = VALIDATION_PATTERNS.UUID.test(originId) && (await publicBookingDal.removeOrigin(businessId, originId));

    if (!removed) throw new AppError(404, ERROR_CODES.ALLOWED_ORIGIN_NOT_FOUND, ERROR_MESSAGES.ALLOWED_ORIGIN_NOT_FOUND);
  }

  public async getEmbedPolicy(slug: string): Promise<EmbedPolicyResponse> {
    const business = await businessService.getPublicBusiness(slug);
    const origins = await publicBookingDal.listOrigins(business.id);

    return { origins: origins.map((item) => item.origin) };
  }

  /** The business, if it takes guest bookings. */
  private async getGuestBusiness(slug: string) {
    const business = await businessService.getPublicBusiness(slug);

    if (!parseStoredBusinessSettings(business.settings).allowGuestBooking) {
      throw new AppError(403, ERROR_CODES.GUEST_BOOKING_DISABLED, ERROR_MESSAGES.GUEST_BOOKING_DISABLED);
    }

    return business;
  }

  private async createGuestUser(email: string, fullName: string, now: Date) {
    try {
      return await authDal.createUser({ email, fullName, passwordHash: null, emailVerifiedAt: now });
    } catch (error) {
      // Two verifications raced; the other one made the account.
      if (!isUniqueConstraintError(error)) throw error;

      const user = await authDal.findUserByEmail(email);

      if (!user) throw error;

      return user;
    }
  }

  private async checkCode(key: { email: string; businessId: string }, code: string, now: Date): Promise<void> {
    const maxAttempts = PUBLIC_BOOKING_CONSTANTS.GUEST_CODE_MAX_ATTEMPTS;
    const active = await publicBookingDal.findActiveCode(key, now, maxAttempts);

    // Every guess counts, so a code can only be tried a few times.
    if (!active || !(await publicBookingDal.recordAttempt(active.id, maxAttempts))) this.throwInvalidCode();
    if (!secretMatches(code, active.codeHash) || !(await publicBookingDal.consumeCode(active.id))) this.throwInvalidCode();
  }

  private throwInvalidCode(): never {
    throw new AppError(400, ERROR_CODES.INVALID_GUEST_CODE, ERROR_MESSAGES.INVALID_GUEST_CODE, {
      code: [ERROR_MESSAGES.INVALID_GUEST_CODE],
    });
  }
}

export const publicBookingService = new PublicBookingService();
