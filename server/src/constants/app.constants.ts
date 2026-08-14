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
  RESPONSE_LOCALE: "en-US",
  ASSISTANT_MESSAGES: {
    UNKNOWN_INTENT:
      "I can help you book an appointment. Tell me the service, date, and time you would prefer.",
    CONFIRMATION_SUFFIX: "Please confirm to create this appointment.",
    BOOKING_SUCCESS_PREFIX: "Your appointment has been booked",
  },
} as const;

export const AI_CONSTANTS = {
  PROVIDER: "mistral",
  CHAT_COMPLETIONS_PATH: "/chat/completions",
  DEFAULT_MODEL: "mistral-small-latest",
  DEFAULT_API_URL: "https://api.mistral.ai/v1",
  DEFAULT_REQUEST_TIMEOUT_MS: 15_000,
  MIN_REQUEST_TIMEOUT_MS: 1_000,
  MAX_REQUEST_TIMEOUT_MS: 60_000,
  DEFAULT_MAX_HISTORY_MESSAGES: 12,
  MAX_HISTORY_MESSAGES: 50,
  HISTORY_QUERY_LIMIT: 51,
  MAX_OUTPUT_TOKENS: 600,
  TEMPERATURE: 0,
  INTENTS: ["BOOK_APPOINTMENT", "UNKNOWN"] as const,
  CONVERSATION_ROLES: ["user", "assistant"] as const,
  BOOKING_FIELDS: [
    "serviceName",
    "scheduledAt",
    "durationMinutes",
    "notes",
  ] as const,
  REQUIRED_BOOKING_FIELDS: ["serviceName", "scheduledAt"] as const,
  PROVIDER_ERROR_CODES: [
    "TIMEOUT",
    "NETWORK_ERROR",
    "HTTP_ERROR",
    "INVALID_RESPONSE",
  ] as const,
  MAX_TIME_ZONE_LENGTH: 100,
  MAX_CLARIFICATION_QUESTION_LENGTH: 300,
  CLARIFICATION_QUESTIONS: {
    serviceName: "What service would you like to book?",
    scheduledAt: "What date and time would you prefer for the appointment?",
    serviceNameAndScheduledAt:
      "What service would you like to book, and what date and time would you prefer?",
  },
} as const;

export const VALIDATION_PATTERNS = {
  ISO_8601_DATE_TIME_WITH_TIME_ZONE:
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
} as const;

export const ERROR_CODES = {
  AI_INVALID_RESPONSE: "AI_INVALID_RESPONSE",
  AI_NOT_CONFIGURED: "AI_NOT_CONFIGURED",
  AI_PROVIDER_UNAVAILABLE: "AI_PROVIDER_UNAVAILABLE",
  AI_REQUEST_TIMEOUT: "AI_REQUEST_TIMEOUT",
  APPOINTMENT_NOT_FOUND: "APPOINTMENT_NOT_FOUND",
  APPOINTMENT_SLOT_UNAVAILABLE: "APPOINTMENT_SLOT_UNAVAILABLE",
  CHAT_MESSAGE_ALREADY_EXISTS: "CHAT_MESSAGE_ALREADY_EXISTS",
  CHAT_BOOKING_CONTEXT_INCOMPLETE: "CHAT_BOOKING_CONTEXT_INCOMPLETE",
  CHAT_SESSION_CLOSED: "CHAT_SESSION_CLOSED",
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
  AI_INVALID_RESPONSE: "The AI provider returned an invalid response",
  AI_NOT_CONFIGURED: "The AI integration is not configured",
  AI_PROVIDER_UNAVAILABLE: "The AI provider is temporarily unavailable",
  AI_REQUEST_TIMEOUT: "The AI provider did not respond in time",
  APPOINTMENT_NOT_FOUND: "Appointment was not found",
  APPOINTMENT_SLOT_UNAVAILABLE:
    "An appointment already exists at the selected time",
  CHAT_MESSAGE_ALREADY_EXISTS:
    "A message with this client message ID already exists",
  CHAT_BOOKING_CONTEXT_INCOMPLETE:
    "The booking details must include a valid service, date, and time",
  CHAT_SESSION_CLOSED: "This chat session is already closed",
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
  AI_APPOINTMENT_CONTEXT: "Appointment context is invalid",
  AI_CONVERSATION_HISTORY: "Conversation history is invalid",
  AI_CURRENT_DATE_TIME: "Current date and time must be valid",
  AI_TIME_ZONE: "Time zone must be a valid IANA time zone",
  AI_USER_MESSAGE: "Message must contain between 1 and 4000 characters",
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
