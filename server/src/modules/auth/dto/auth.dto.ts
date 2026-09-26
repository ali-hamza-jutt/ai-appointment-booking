/**
 * @pattern ^[^\s@]+@[^\s@]+\.[^\s@]+$ Please provide a valid email address
 * @maxLength 254
 */
export type EmailAddress = string;

/**
 * Phone number; spaces, dashes and brackets are ignored.
 * @minLength 7
 * @maxLength 24
 */
export type PhoneNumberInput = string;

export interface AuthUserResponse {
  id: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
  /** Verified phone number in E.164 format. */
  phone: string | null;
  /** False for accounts that only sign in with Google. */
  hasPassword: boolean;
}

/**
 * The access token is returned in the body; the refresh token is set as an
 * httpOnly cookie and never exposed to scripts.
 */
export interface AuthResponse {
  user: AuthUserResponse;
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

export interface SignUpRequest {
  /** @minLength 2 @maxLength 80 */
  fullName: string;

  email: EmailAddress;

  /** @minLength 8 @maxLength 128 */
  password: string;

  /** Keep the session after the browser closes. */
  rememberMe?: boolean;
}

export interface SignInRequest {
  email: EmailAddress;

  /** @minLength 1 @maxLength 128 */
  password: string;

  /** Keep the session after the browser closes. */
  rememberMe?: boolean;
}

export interface ForgotPasswordRequest {
  email: EmailAddress;
}

export interface ResetPasswordRequest {
  /** @minLength 20 @maxLength 200 */
  token: string;

  /** @minLength 8 @maxLength 128 */
  password: string;
}

export interface VerifyEmailRequest {
  /** @minLength 20 @maxLength 200 */
  token: string;
}

export interface PhoneCodeRequest {
  phone: PhoneNumberInput;
}

export interface PhoneVerifyRequest {
  phone: PhoneNumberInput;

  /** @pattern ^\d{6}$ Enter the 6-digit code */
  code: string;
}

export interface PhoneSignInRequest extends PhoneVerifyRequest {
  rememberMe?: boolean;
}

/** Which optional sign-in methods this deployment offers. */
export interface AuthProvidersResponse {
  google: boolean;
  phone: boolean;
}

export interface CreateUserData {
  email: string;
  fullName: string;
  passwordHash: string | null;
  emailVerifiedAt?: Date;
  googleSubject?: string;
}

export interface PublicUserRecord {
  id: string;
  email: string;
  fullName: string;
  emailVerifiedAt: Date | null;
  phone: string | null;
  passwordHash: string | null;
}

export interface GoogleUserRecord extends PublicUserRecord {
  googleSubject: string | null;
}

/** A refresh token ready to be set as a cookie. */
export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
  persistent: boolean;
}

/** A signed-in session: the API response plus the cookie to set. */
export interface AuthSession {
  response: AuthResponse;
  refreshToken: IssuedRefreshToken;
}

export interface SessionOptions {
  persistent: boolean;
  userAgent: string | null;
}

export interface GoogleProfile {
  subject: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
}
