import { logger } from "../../config/logger.js";
import {
  AUTH_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
} from "../../constants/app.constants.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { mailer, type EmailMessage } from "../../infrastructure/messaging/mailer.js";
import { AppError } from "../../middleware/app-error.js";
import { isUniqueConstraintError } from "../../utils/database.js";
import {
  hashPassword,
  isStrongPassword,
  verifyPassword,
} from "../../utils/password.js";
import { createOpaqueToken, hashSecret } from "../../utils/secure-token.js";
import { normalizeEmail, normalizeFullName } from "../../utils/text.js";
import { memberService } from "../businesses/member.service.js";
import { passwordResetEmail, verificationEmail } from "./auth-emails.js";
import { authTokenDal } from "./dal/auth-token.dal.js";
import { authDal } from "./dal/auth.dal.js";
import type {
  AuthSession,
  AuthUserResponse,
  PublicUserRecord,
  ResetPasswordRequest,
  SignInRequest,
  SignUpRequest,
} from "./dto/auth.dto.js";
import { sessionService, toAuthUserResponse } from "./session.service.js";

const MILLISECONDS_PER_MINUTE = 60_000;

export class AuthService {
  public async signUp(request: SignUpRequest, userAgent: string | null): Promise<AuthSession> {
    const email = normalizeEmail(request.email);
    const fullName = normalizeFullName(request.fullName);

    if (fullName.length < 2) {
      throw new AppError(422, ERROR_CODES.INVALID_FULL_NAME, ERROR_MESSAGES.INVALID_FULL_NAME, {
        fullName: [ERROR_MESSAGES.INVALID_FULL_NAME],
      });
    }

    this.assertStrongPassword(request.password);

    const passwordHash = await hashPassword(request.password);
    let user: PublicUserRecord;

    try {
      user = await authDal.createUser({ email, fullName, passwordHash });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(409, ERROR_CODES.EMAIL_ALREADY_EXISTS, ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
      }

      throw error;
    }

    await memberService.acceptPendingInvitations(user.id, user.email);
    await this.sendVerificationEmail(user);

    return sessionService.startSession(user, {
      persistent: request.rememberMe ?? true,
      userAgent,
    });
  }

  public async signIn(request: SignInRequest, userAgent: string | null): Promise<AuthSession> {
    const user = await authDal.findUserByEmail(normalizeEmail(request.email));
    // Always run a hash check so response time doesn't reveal which emails exist.
    const passwordHash = user?.passwordHash ?? AUTH_CONSTANTS.DUMMY_PASSWORD_HASH;
    const passwordIsValid = await verifyPassword(passwordHash, request.password);

    if (!user?.passwordHash || !passwordIsValid) {
      throw new AppError(401, ERROR_CODES.INVALID_CREDENTIALS, ERROR_MESSAGES.INVALID_CREDENTIALS);
    }

    return sessionService.startSession(user, {
      persistent: request.rememberMe ?? true,
      userAgent,
    });
  }

  public async getCurrentUser(userId: string, impersonatorId?: string): Promise<AuthUserResponse> {
    const user = await authDal.findUserById(userId);

    if (!user) {
      throw new AppError(404, ERROR_CODES.USER_NOT_FOUND, ERROR_MESSAGES.USER_NOT_FOUND);
    }

    const impersonator = impersonatorId ? await authDal.findUserById(impersonatorId) : null;

    return { ...toAuthUserResponse(user), impersonatedBy: impersonator?.fullName ?? null };
  }

  public async resendVerification(userId: string): Promise<void> {
    const user = await authDal.findUserById(userId);

    if (user && !user.emailVerifiedAt) await this.sendVerificationEmail(user);
  }

  public async verifyEmail(token: string): Promise<AuthUserResponse> {
    const now = new Date();
    const user = await prisma.$transaction(async (transaction) => {
      const userId = await authTokenDal.consume(hashSecret(token), "EMAIL_VERIFICATION", now, transaction);

      return userId ? authDal.updateUser(userId, { emailVerifiedAt: now }, transaction) : null;
    });

    if (!user) this.throwInvalidLink();

    return toAuthUserResponse(user);
  }

  /** Always succeeds, so the response never reveals whether an email is registered. */
  public async requestPasswordReset(email: string): Promise<void> {
    const user = await authDal.findUserByEmail(normalizeEmail(email));

    if (!user) return;

    const token = createOpaqueToken();
    const minutes = AUTH_CONSTANTS.PASSWORD_RESET_TTL_MINUTES;

    await authTokenDal.replace({
      userId: user.id,
      purpose: "PASSWORD_RESET",
      tokenHash: hashSecret(token),
      expiresAt: new Date(Date.now() + minutes * MILLISECONDS_PER_MINUTE),
    });
    await this.deliver(passwordResetEmail(user.email, user.fullName, token, minutes));
  }

  /** Sets a new password and signs the account out everywhere. */
  public async resetPassword(request: ResetPasswordRequest): Promise<void> {
    this.assertStrongPassword(request.password);

    const passwordHash = await hashPassword(request.password);
    const now = new Date();
    const userId = await prisma.$transaction(async (transaction) => {
      const owner = await authTokenDal.consume(hashSecret(request.token), "PASSWORD_RESET", now, transaction);

      if (!owner) return null;

      // Following the emailed link also proves the address.
      await authDal.updateUser(owner, { passwordHash, emailVerifiedAt: now }, transaction);

      return owner;
    });

    if (!userId) this.throwInvalidLink();

    await sessionService.revokeAllForUser(userId);
  }

  private async sendVerificationEmail(user: PublicUserRecord): Promise<void> {
    const token = createOpaqueToken();
    const hours = AUTH_CONSTANTS.EMAIL_VERIFICATION_TTL_HOURS;

    await authTokenDal.replace({
      userId: user.id,
      purpose: "EMAIL_VERIFICATION",
      tokenHash: hashSecret(token),
      expiresAt: new Date(Date.now() + hours * 60 * MILLISECONDS_PER_MINUTE),
    });
    await this.deliver(verificationEmail(user.email, user.fullName, token, hours));
  }

  /** Email is best-effort: a mail outage must not fail sign-up. */
  private async deliver(message: EmailMessage): Promise<void> {
    try {
      await mailer.send(message);
    } catch (error) {
      logger.error({ err: error, subject: message.subject }, "Email delivery failed");
    }
  }

  private assertStrongPassword(password: string): void {
    if (!isStrongPassword(password)) {
      throw new AppError(422, ERROR_CODES.WEAK_PASSWORD, ERROR_MESSAGES.WEAK_PASSWORD, {
        password: [ERROR_MESSAGES.WEAK_PASSWORD],
      });
    }
  }

  private throwInvalidLink(): never {
    throw new AppError(400, ERROR_CODES.INVALID_AUTH_LINK, ERROR_MESSAGES.INVALID_AUTH_LINK);
  }
}

export const authService = new AuthService();
