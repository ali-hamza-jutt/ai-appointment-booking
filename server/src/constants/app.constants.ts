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
  MILLISECONDS_PER_MINUTE: 60_000,
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
  RATE_LIMIT_WINDOW_MS: 60 * 1_000,
  RATE_LIMIT_MAX_REQUESTS: 20,
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
      "I’m focused on appointment booking. Tell me the service, date, and time you would prefer, and I’ll help you schedule it.",
    GREETING:
      "Hello! I can help you book an appointment. What would you like to schedule?",
    BOOKING_HELP:
      "I can collect the service, date, time, duration, and notes for a new appointment. Tell me any details you already know, or use the booking form.",
    MANAGE_APPOINTMENT:
      "To cancel or reschedule an existing booking, open My appointments and choose the appointment you want to manage.",
    PAST_TIME:
      "That time has already passed in your timezone. Please choose a future date and time.",
    INVALID_TIME:
      "I couldn’t interpret that date and time safely. Please provide a specific future date and time.",
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
  MAX_COMPLETION_ATTEMPTS: 2,
  INTENTS: [
    "BOOK_APPOINTMENT",
    "GREETING",
    "BOOKING_HELP",
    "MANAGE_APPOINTMENT",
    "OUT_OF_SCOPE",
  ] as const,
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
  MAX_ASSISTANT_REPLY_LENGTH: 500,
  PURE_GREETING_PATTERN:
    /^(?:(?:hi|hello|hey)(?:\s+there)?|good\s+(?:morning|afternoon|evening))[.!?\s]*$/i,
  BOOKING_HELP_PATTERN:
    /^(?:help|what\s+can\s+you\s+do|how\s+(?:can|do)\s+(?:i|you)\s+(?:book|schedule)(?:\s+an?\s+appointment)?)[.!?\s]*$/i,
  MANAGE_APPOINTMENT_PATTERN:
    /^(?:please\s+)?(?:cancel|reschedule)\s+(?:my\s+)?(?:existing\s+)?appointment[.!?\s]*$/i,
  EXPLICIT_SERVICE_CHANGE_PATTERN:
    /^(?:please\s+)?(?:change|update)\s+(?:the\s+)?service(?:\s+name)?\s+to\s+(.+?)[.!?]*$/i,
  SERVICE_CHANGE_TRAILING_DETAILS_PATTERN:
    /\s+(?:and\s+)?(?:(?:move|change|set|schedule|book)\b|(?:the\s+)?(?:date|time|duration|notes?)\s+to\b).*$/i,
  CLEAR_SERVICE_PATTERN:
    /^(?:please\s+)?(?:clear|remove)\s+(?:the\s+)?service(?:\s+name)?[.!?\s]*$/i,
  CLEAR_SCHEDULE_PATTERN:
    /^(?:please\s+)?(?:clear|remove)\s+(?:the\s+)?(?:date|time|scheduled\s+time|schedule)[.!?\s]*$/i,
  CLEAR_NOTES_PATTERN:
    /^(?:(?:please\s+)?(?:clear|remove)\s+(?:the\s+)?notes?|no\s+notes?)[.!?\s]*$/i,
  DEFAULT_DURATION_PATTERN:
    /^(?:(?:please\s+)?(?:clear|remove|reset)\s+(?:the\s+)?duration|use\s+(?:the\s+)?default\s+duration)[.!?\s]*$/i,
  CLARIFICATION_QUESTIONS: {
    serviceName: "What service would you like to book?",
    scheduledAt: "What date and time would you prefer for the appointment?",
    serviceNameAndScheduledAt:
      "What service would you like to book, and what date and time would you prefer?",
  },
} as const;

export const VALIDATION_PATTERNS = {
  LOCAL_DATE: /^\d{4}-\d{2}-\d{2}$/,
  LOCAL_TIME: /^(?:[01]\d|2[0-3]):[0-5]\d$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
} as const;

export const ERROR_CODES = {
  AI_INVALID_RESPONSE: "AI_INVALID_RESPONSE",
  AI_NOT_CONFIGURED: "AI_NOT_CONFIGURED",
  AI_PROVIDER_UNAVAILABLE: "AI_PROVIDER_UNAVAILABLE",
  AI_REQUEST_TIMEOUT: "AI_REQUEST_TIMEOUT",
  APPOINTMENT_NOT_FOUND: "APPOINTMENT_NOT_FOUND",
  APPOINTMENT_CANCELLATION_NOT_ALLOWED:
    "APPOINTMENT_CANCELLATION_NOT_ALLOWED",
  APPOINTMENT_RESCHEDULE_NOT_ALLOWED: "APPOINTMENT_RESCHEDULE_NOT_ALLOWED",
  APPOINTMENT_SLOT_UNAVAILABLE: "APPOINTMENT_SLOT_UNAVAILABLE",
  CHAT_MESSAGE_ALREADY_EXISTS: "CHAT_MESSAGE_ALREADY_EXISTS",
  CHAT_BOOKING_CONTEXT_INCOMPLETE: "CHAT_BOOKING_CONTEXT_INCOMPLETE",
  CHAT_SESSION_CLOSED: "CHAT_SESSION_CLOSED",
  CHAT_SESSION_NOT_ACTIVE: "CHAT_SESSION_NOT_ACTIVE",
  CHAT_SESSION_NOT_FOUND: "CHAT_SESSION_NOT_FOUND",
  EMAIL_ALREADY_EXISTS: "EMAIL_ALREADY_EXISTS",
  INSUFFICIENT_SCOPE: "INSUFFICIENT_SCOPE",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  INVALID_FULL_NAME: "INVALID_FULL_NAME",
  INVALID_JSON_BODY: "INVALID_JSON_BODY",
  INVALID_PAGINATION_CURSOR: "INVALID_PAGINATION_CURSOR",
  INVALID_TOKEN: "INVALID_TOKEN",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  REQUEST_BODY_TOO_LARGE: "REQUEST_BODY_TOO_LARGE",
  REQUEST_VALIDATION_FAILED: "REQUEST_VALIDATION_FAILED",
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND",
  UNSUPPORTED_AUTHENTICATION: "UNSUPPORTED_AUTHENTICATION",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  WEAK_PASSWORD: "WEAK_PASSWORD",
} as const;

export const ERROR_MESSAGES = {
  AI_INVALID_RESPONSE:
    "The booking assistant couldn’t understand the response. Please retry your message",
  AI_NOT_CONFIGURED: "The AI integration is not configured",
  AI_PROVIDER_UNAVAILABLE:
    "The booking assistant is temporarily unavailable. Please try again",
  AI_REQUEST_TIMEOUT:
    "The booking assistant took too long to respond. Please try again",
  APPOINTMENT_NOT_FOUND: "Appointment was not found",
  APPOINTMENT_CANCELLATION_NOT_ALLOWED:
    "Completed appointments cannot be cancelled",
  APPOINTMENT_RESCHEDULE_NOT_ALLOWED:
    "Cancelled or completed appointments cannot be rescheduled",
  APPOINTMENT_SLOT_UNAVAILABLE:
    "The selected time overlaps with another appointment",
  CHAT_MESSAGE_ALREADY_EXISTS:
    "A message with this client message ID already exists",
  CHAT_BOOKING_CONTEXT_INCOMPLETE:
    "The booking details must include a valid service, date, and time",
  CHAT_SESSION_CLOSED: "This chat session is already closed",
  CHAT_SESSION_NOT_ACTIVE: "This chat session is no longer active",
  CHAT_SESSION_NOT_FOUND: "Chat session was not found",
  EMAIL_ALREADY_EXISTS: "An account with this email already exists",
  INSUFFICIENT_SCOPE: "The access token does not have the required permissions",
  INVALID_CREDENTIALS: "Invalid email or password",
  INVALID_FULL_NAME: "Full name must contain at least 2 characters",
  INVALID_JSON_BODY: "Request body must contain valid JSON",
  INVALID_PAGINATION_CURSOR: "Pagination cursor is invalid",
  INVALID_TOKEN: "A valid access token is required",
  INTERNAL_SERVER_ERROR: "Something went wrong. Please try again.",
  RATE_LIMIT_EXCEEDED: "Too many requests. Try again later",
  REQUEST_BODY_TOO_LARGE: "Request body is too large",
  REQUEST_VALIDATION_FAILED:
    "Check the provided information and try again",
  ROUTE_NOT_FOUND: "The requested API endpoint was not found",
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
  APPOINTMENT_TIME_ZONE: "Time zone must be a valid IANA time zone",
  APPOINTMENT_RESCHEDULE_TIME:
    "Choose a valid future date and time in the appointment time zone",
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
  REQUEST_FIELD: "Check this value and try again",
} as const;

export const DATABASE_ERROR_CODES = {
  RECORD_NOT_FOUND: "P2025",
  UNIQUE_CONSTRAINT: "P2002",
} as const;
