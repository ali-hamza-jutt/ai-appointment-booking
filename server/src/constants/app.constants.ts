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

export const APPOINTMENT_CONSTANTS = {
  DEFAULT_DURATION_MINUTES: 30,
  MIN_DURATION_MINUTES: 5,
  MAX_DURATION_MINUTES: 480,
  MIN_SERVICE_NAME_LENGTH: 2,
  MAX_SERVICE_NAME_LENGTH: 120,
  MAX_NOTES_LENGTH: 2_000,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
} as const;

export const CHAT_CONSTANTS = {
  DEFAULT_SESSION_PAGE_SIZE: 20,
  MAX_SESSION_PAGE_SIZE: 50,
  DEFAULT_MESSAGE_PAGE_SIZE: 50,
  MAX_MESSAGE_PAGE_SIZE: 100,
  MAX_SESSION_TITLE_LENGTH: 120,
  MIN_MESSAGE_LENGTH: 1,
  MAX_MESSAGE_LENGTH: 4_000,
} as const;

export const VALIDATION_PATTERNS = {
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
} as const;

export const ERROR_CODES = {
  APPOINTMENT_NOT_FOUND: "APPOINTMENT_NOT_FOUND",
  APPOINTMENT_SLOT_UNAVAILABLE: "APPOINTMENT_SLOT_UNAVAILABLE",
  CHAT_MESSAGE_ALREADY_EXISTS: "CHAT_MESSAGE_ALREADY_EXISTS",
  CHAT_SESSION_NOT_FOUND: "CHAT_SESSION_NOT_FOUND",
  EMAIL_ALREADY_EXISTS: "EMAIL_ALREADY_EXISTS",
  INSUFFICIENT_SCOPE: "INSUFFICIENT_SCOPE",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  INVALID_FULL_NAME: "INVALID_FULL_NAME",
  INVALID_PAGINATION_CURSOR: "INVALID_PAGINATION_CURSOR",
  INVALID_TOKEN: "INVALID_TOKEN",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  REQUEST_VALIDATION_FAILED: "REQUEST_VALIDATION_FAILED",
  UNSUPPORTED_AUTHENTICATION: "UNSUPPORTED_AUTHENTICATION",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  WEAK_PASSWORD: "WEAK_PASSWORD",
} as const;

export const ERROR_MESSAGES = {
  APPOINTMENT_NOT_FOUND: "Appointment was not found",
  APPOINTMENT_SLOT_UNAVAILABLE:
    "An appointment already exists at the selected time",
  CHAT_MESSAGE_ALREADY_EXISTS:
    "A message with this client message ID already exists",
  CHAT_SESSION_NOT_FOUND: "Chat session was not found",
  EMAIL_ALREADY_EXISTS: "An account with this email already exists",
  INSUFFICIENT_SCOPE: "The access token does not have the required permissions",
  INVALID_CREDENTIALS: "Invalid email or password",
  INVALID_FULL_NAME: "Full name must contain at least 2 characters",
  INVALID_PAGINATION_CURSOR: "Pagination cursor is invalid",
  INVALID_TOKEN: "A valid access token is required",
  INTERNAL_SERVER_ERROR: "An unexpected error occurred",
  RATE_LIMIT_EXCEEDED: "Too many authentication attempts. Try again later",
  REQUEST_VALIDATION_FAILED: "Request validation failed",
  UNSUPPORTED_AUTHENTICATION: "Unsupported authentication method",
  USER_NOT_FOUND: "User account was not found",
  WEAK_PASSWORD:
    "Password must include an uppercase letter, a lowercase letter, and a number",
} as const;

export const VALIDATION_MESSAGES = {
  APPOINTMENT_ID: "Appointment ID must be a valid UUID",
  APPOINTMENT_SERVICE_NAME:
    "Service name must contain between 2 and 120 characters",
  APPOINTMENT_TIME: "Scheduled time must be a valid future date and time",
  APPOINTMENT_DURATION: "Duration must be an integer between 5 and 480 minutes",
  APPOINTMENT_NOTES: "Notes cannot exceed 2000 characters",
  BOOKING_CONTEXT_DURATION:
    "Booking duration must be an integer between 5 and 480 minutes",
  BOOKING_CONTEXT_TIME: "Booking time must be a valid future date and time",
  CHAT_MESSAGE_CONTENT: "Message must contain between 1 and 4000 characters",
  CHAT_MESSAGE_ID: "Client message ID must be a valid UUID",
  CHAT_MESSAGE_LIMIT: "Message limit must be an integer between 1 and 100",
  CHAT_SESSION_ID: "Chat session ID must be a valid UUID",
  CHAT_SESSION_LIMIT: "Session limit must be an integer between 1 and 50",
  CHAT_SESSION_TITLE: "Chat session title cannot exceed 120 characters",
  PAGINATION_LIMIT: "Limit must be an integer between 1 and 50",
} as const;

export const DATABASE_ERROR_CODES = {
  RECORD_NOT_FOUND: "P2025",
  UNIQUE_CONSTRAINT: "P2002",
} as const;
