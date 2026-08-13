export const AUTH_CONSTANTS = {
  SECURITY_NAME: "jwt",
  JWT_ALGORITHM: "HS256",
  TOKEN_TYPE: "Bearer",
  DEFAULT_ACCESS_TOKEN_TTL_SECONDS: 900,
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128,
  PASSWORD_PATTERN: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
  ARGON2_MEMORY_COST_KIB: 19_456,
  ARGON2_TIME_COST: 2,
  ARGON2_PARALLELISM: 1,
  DUMMY_PASSWORD_HASH:
    "$argon2id$v=19$m=19456,p=1,t=2$ee687CeZQTTF7lmoaFvrzA$fMN19SUVpiBZK3jJWaLePMkJLF23TJ2u8g8nAJSWX/o",
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1_000,
  RATE_LIMIT_MAX_REQUESTS: 10,
} as const;

export const ERROR_CODES = {
  EMAIL_ALREADY_EXISTS: "EMAIL_ALREADY_EXISTS",
  INSUFFICIENT_SCOPE: "INSUFFICIENT_SCOPE",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  INVALID_FULL_NAME: "INVALID_FULL_NAME",
  INVALID_TOKEN: "INVALID_TOKEN",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  REQUEST_VALIDATION_FAILED: "REQUEST_VALIDATION_FAILED",
  UNSUPPORTED_AUTHENTICATION: "UNSUPPORTED_AUTHENTICATION",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  WEAK_PASSWORD: "WEAK_PASSWORD",
} as const;

export const ERROR_MESSAGES = {
  EMAIL_ALREADY_EXISTS: "An account with this email already exists",
  INSUFFICIENT_SCOPE: "The access token does not have the required permissions",
  INVALID_CREDENTIALS: "Invalid email or password",
  INVALID_FULL_NAME: "Full name must contain at least 2 characters",
  INVALID_TOKEN: "A valid access token is required",
  INTERNAL_SERVER_ERROR: "An unexpected error occurred",
  RATE_LIMIT_EXCEEDED: "Too many authentication attempts. Try again later",
  REQUEST_VALIDATION_FAILED: "Request validation failed",
  UNSUPPORTED_AUTHENTICATION: "Unsupported authentication method",
  USER_NOT_FOUND: "User account was not found",
  WEAK_PASSWORD:
    "Password must include an uppercase letter, a lowercase letter, and a number",
} as const;

export const DATABASE_ERROR_CODES = {
  UNIQUE_CONSTRAINT: "P2002",
} as const;
