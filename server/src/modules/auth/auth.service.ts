import {
  AUTH_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
} from "../../constants/app.constants.js";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/app-error.js";
import { isUniqueConstraintError } from "../../utils/database.js";
import { createAccessToken } from "../../utils/jwt.js";
import {
  hashPassword,
  isStrongPassword,
  verifyPassword,
} from "../../utils/password.js";
import { normalizeEmail, normalizeFullName } from "../../utils/text.js";
import { authDal, type PublicUserRecord } from "./dal/auth.dal.js";
import type {
  AuthResponse,
  SignInRequest,
  SignUpRequest,
} from "./dto/auth.dto.js";

export class AuthService {
  public async signUp(request: SignUpRequest): Promise<AuthResponse> {
    const email = normalizeEmail(request.email);
    const fullName = normalizeFullName(request.fullName);

    if (fullName.length < 2) {
      throw new AppError(
        422,
        ERROR_CODES.INVALID_FULL_NAME,
        ERROR_MESSAGES.INVALID_FULL_NAME,
        { fullName: [ERROR_MESSAGES.INVALID_FULL_NAME] },
      );
    }

    if (!isStrongPassword(request.password)) {
      throw new AppError(
        422,
        ERROR_CODES.WEAK_PASSWORD,
        ERROR_MESSAGES.WEAK_PASSWORD,
        { password: [ERROR_MESSAGES.WEAK_PASSWORD] },
      );
    }

    const passwordHash = await hashPassword(request.password);

    try {
      const user = await authDal.createUser({
        email,
        fullName,
        passwordHash,
      });

      return this.createAuthResponse(user);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(
          409,
          ERROR_CODES.EMAIL_ALREADY_EXISTS,
          ERROR_MESSAGES.EMAIL_ALREADY_EXISTS,
        );
      }

      throw error;
    }
  }

  public async signIn(request: SignInRequest): Promise<AuthResponse> {
    const email = normalizeEmail(request.email);
    const user = await authDal.findUserCredentialsByEmail(email);
    const passwordHash = user?.passwordHash ?? AUTH_CONSTANTS.DUMMY_PASSWORD_HASH;
    const passwordIsValid = await verifyPassword(passwordHash, request.password);

    if (!user || !passwordIsValid) {
      throw new AppError(
        401,
        ERROR_CODES.INVALID_CREDENTIALS,
        ERROR_MESSAGES.INVALID_CREDENTIALS,
      );
    }

    return this.createAuthResponse(user);
  }

  private async createAuthResponse(
    user: PublicUserRecord,
  ): Promise<AuthResponse> {
    const accessToken = await createAccessToken({
      subject: user.id,
      email: user.email,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      accessToken,
      tokenType: AUTH_CONSTANTS.TOKEN_TYPE,
      expiresIn: env.JWT_ACCESS_TOKEN_TTL_SECONDS,
    };
  }
}

export const authService = new AuthService();
