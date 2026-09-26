import {
  AUTH_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
} from "../../constants/app.constants.js";
import type { PhoneVerificationPurpose } from "../../generated/prisma/client.js";
import { smsSender } from "../../infrastructure/messaging/sms-sender.js";
import { AppError } from "../../middleware/app-error.js";
import { isUniqueConstraintError } from "../../utils/database.js";
import { createNumericCode, hashSecret, secretMatches } from "../../utils/secure-token.js";
import { authDal } from "./dal/auth.dal.js";
import { phoneVerificationDal } from "./dal/phone-verification.dal.js";
import type { AuthSession, AuthUserResponse } from "./dto/auth.dto.js";
import { sessionService, toAuthUserResponse } from "./session.service.js";

const MILLISECONDS_PER_MINUTE = 60_000;

/** Strips formatting and checks for an E.164 number such as +447700900123. */
export function normalizePhoneNumber(value: string): string {
  const compact = value.replace(/[\s().-]/g, "");

  if (!AUTH_CONSTANTS.E164_PHONE_PATTERN.test(compact)) {
    throw new AppError(422, ERROR_CODES.INVALID_PHONE_NUMBER, ERROR_MESSAGES.INVALID_PHONE_NUMBER, {
      phone: [ERROR_MESSAGES.INVALID_PHONE_NUMBER],
    });
  }

  return compact;
}

/**
 * One-time SMS codes: signed-in users confirm a phone number to link it,
 * then can sign in with that number (for guests and messaging channels).
 */
export class PhoneAuthService {
  public get isAvailable(): boolean {
    return smsSender.isAvailable;
  }

  public async sendLinkCode(userId: string, phoneInput: string): Promise<void> {
    const phone = normalizePhoneNumber(phoneInput);
    const key = { phone, purpose: "LINK" as const, userId };

    this.assertSmsAvailable();

    if (await this.sentRecently(key)) {
      throw new AppError(429, ERROR_CODES.PHONE_CODE_RECENTLY_SENT, ERROR_MESSAGES.PHONE_CODE_RECENTLY_SENT);
    }

    const owner = await authDal.findUserByPhone(phone);

    if (owner && owner.id !== userId) {
      throw new AppError(409, ERROR_CODES.PHONE_ALREADY_IN_USE, ERROR_MESSAGES.PHONE_ALREADY_IN_USE);
    }

    await this.sendCode(key);
  }

  public async confirmLink(userId: string, phoneInput: string, code: string): Promise<AuthUserResponse> {
    const phone = normalizePhoneNumber(phoneInput);

    await this.checkCode({ phone, purpose: "LINK", userId }, code);

    try {
      const user = await authDal.updateUser(userId, { phone, phoneVerifiedAt: new Date() });

      return toAuthUserResponse(user);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(409, ERROR_CODES.PHONE_ALREADY_IN_USE, ERROR_MESSAGES.PHONE_ALREADY_IN_USE);
      }

      throw error;
    }
  }

  /**
   * Sends a sign-in code only to numbers linked to an account, and answers
   * the same way either way so numbers can't be probed.
   */
  public async sendSignInCode(phoneInput: string): Promise<void> {
    const phone = normalizePhoneNumber(phoneInput);
    const key = { phone, purpose: "SIGN_IN" as const, userId: null };

    this.assertSmsAvailable();

    if (!(await authDal.findUserByPhone(phone)) || (await this.sentRecently(key))) return;

    await this.sendCode(key);
  }

  public async signIn(
    phoneInput: string,
    code: string,
    options: { persistent: boolean; userAgent: string | null },
  ): Promise<AuthSession> {
    const phone = normalizePhoneNumber(phoneInput);

    await this.checkCode({ phone, purpose: "SIGN_IN", userId: null }, code);

    const user = await authDal.findUserByPhone(phone);

    if (!user) this.throwInvalidCode();

    return sessionService.startSession(user, options);
  }

  private async sendCode(key: {
    phone: string;
    purpose: PhoneVerificationPurpose;
    userId: string | null;
  }): Promise<void> {
    const code = createNumericCode();
    const minutes = AUTH_CONSTANTS.PHONE_CODE_TTL_MINUTES;

    await phoneVerificationDal.replace(
      key,
      hashSecret(code),
      new Date(Date.now() + minutes * MILLISECONDS_PER_MINUTE),
    );
    await smsSender.send({
      to: key.phone,
      text: `${code} is your BookWise code. It expires in ${minutes} minutes.`,
    });
  }

  private async checkCode(
    key: { phone: string; purpose: PhoneVerificationPurpose; userId: string | null },
    code: string,
  ): Promise<void> {
    const maxAttempts = AUTH_CONSTANTS.PHONE_CODE_MAX_ATTEMPTS;
    const verification = await phoneVerificationDal.findActive(key, new Date(), maxAttempts);

    // Every guess counts, so a code can only be tried a few times.
    if (!verification || !(await phoneVerificationDal.recordAttempt(verification.id, maxAttempts))) {
      this.throwInvalidCode();
    }

    if (!secretMatches(code, verification.codeHash) || !(await phoneVerificationDal.consume(verification.id))) {
      this.throwInvalidCode();
    }
  }

  private async sentRecently(key: {
    phone: string;
    purpose: PhoneVerificationPurpose;
    userId: string | null;
  }): Promise<boolean> {
    const latest = await phoneVerificationDal.findLatest(key);

    return Boolean(
      latest && Date.now() - latest.createdAt.getTime() < AUTH_CONSTANTS.PHONE_CODE_RESEND_SECONDS * 1_000,
    );
  }

  private assertSmsAvailable(): void {
    if (!smsSender.isAvailable) {
      throw new AppError(503, ERROR_CODES.SMS_NOT_CONFIGURED, ERROR_MESSAGES.SMS_NOT_CONFIGURED);
    }
  }

  private throwInvalidCode(): never {
    throw new AppError(400, ERROR_CODES.INVALID_PHONE_CODE, ERROR_MESSAGES.INVALID_PHONE_CODE, {
      code: [ERROR_MESSAGES.INVALID_PHONE_CODE],
    });
  }
}

export const phoneAuthService = new PhoneAuthService();
