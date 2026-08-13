/**
 * @pattern ^[^\s@]+@[^\s@]+\.[^\s@]+$ Please provide a valid email address
 * @maxLength 254
 */
export type EmailAddress = string;

export interface AuthUserResponse {
  id: string;
  email: string;
  fullName: string;
}

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
}

export interface SignInRequest {
  email: EmailAddress;

  /** @minLength 1 @maxLength 128 */
  password: string;
}

export interface CreateUserData {
  email: string;
  fullName: string;
  passwordHash: string;
}

export interface PublicUserRecord {
  id: string;
  email: string;
  fullName: string;
}

export interface CredentialUserRecord extends PublicUserRecord {
  passwordHash: string;
}
