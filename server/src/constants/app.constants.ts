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
  REFRESH_COOKIE_NAME: "bw_refresh",
  REFRESH_COOKIE_PATH: "/api/auth",
  OAUTH_STATE_COOKIE_NAME: "bw_oauth",
  OAUTH_STATE_COOKIE_PATH: "/api/auth/google",
  OAUTH_STATE_TTL_SECONDS: 10 * 60,
  /** "Keep me signed in" sessions; others end with the browser or after a day. */
  PERSISTENT_REFRESH_TTL_DAYS: 30,
  SESSION_REFRESH_TTL_HOURS: 24,
  /** A rotated token presented again within this window is a concurrent refresh, not theft. */
  REFRESH_REUSE_GRACE_SECONDS: 10,
  TOKEN_BYTES: 32,
  EMAIL_VERIFICATION_TTL_HOURS: 48,
  PASSWORD_RESET_TTL_MINUTES: 60,
  PHONE_CODE_LENGTH: 6,
  PHONE_CODE_TTL_MINUTES: 10,
  PHONE_CODE_MAX_ATTEMPTS: 5,
  PHONE_CODE_RESEND_SECONDS: 60,
  E164_PHONE_PATTERN: /^\+[1-9]\d{6,14}$/,
  GOOGLE_AUTHORIZE_URL: "https://accounts.google.com/o/oauth2/v2/auth",
  GOOGLE_TOKEN_URL: "https://oauth2.googleapis.com/token",
  GOOGLE_JWKS_URL: "https://www.googleapis.com/oauth2/v3/certs",
  GOOGLE_ISSUERS: ["https://accounts.google.com", "accounts.google.com"],
  GOOGLE_SCOPES: "openid email profile",
  /** Stricter per-route limits, on top of the general auth limit. */
  SENSITIVE_RATE_LIMIT_WINDOW_MS: 60 * 60 * 1_000,
  SENSITIVE_RATE_LIMIT_MAX_REQUESTS: 5,
  REFRESH_RATE_LIMIT_WINDOW_MS: 60 * 1_000,
  REFRESH_RATE_LIMIT_MAX_REQUESTS: 30,
} as const;

export const AUTHORIZATION_SCOPES = {
  BUSINESS_READ: "business:read",
  BUSINESS_OPERATE: "business:operate",
  BUSINESS_MANAGE: "business:manage",
  BUSINESS_OWNER: "business:owner",
  PLATFORM_ADMIN: "platform:admin",
} as const;

export const ROLE_SCOPES = {
  OWNER: [
    AUTHORIZATION_SCOPES.BUSINESS_READ,
    AUTHORIZATION_SCOPES.BUSINESS_OPERATE,
    AUTHORIZATION_SCOPES.BUSINESS_MANAGE,
    AUTHORIZATION_SCOPES.BUSINESS_OWNER,
  ],
  MANAGER: [
    AUTHORIZATION_SCOPES.BUSINESS_READ,
    AUTHORIZATION_SCOPES.BUSINESS_OPERATE,
    AUTHORIZATION_SCOPES.BUSINESS_MANAGE,
  ],
  STAFF: [
    AUTHORIZATION_SCOPES.BUSINESS_READ,
    AUTHORIZATION_SCOPES.BUSINESS_OPERATE,
  ],
} as const;

export const BUSINESS_CONSTANTS = {
  DEMO_BUSINESS_ID: "00000000-0000-4000-8000-000000000001",
  BUSINESS_ID_PARAM: "businessId",
  MIN_NAME_LENGTH: 2,
  MAX_NAME_LENGTH: 120,
  MAX_SLUG_LENGTH: 60,
  SLUG_PATTERN: /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/,
  SLUG_SUFFIX_LENGTH: 4,
  MAX_SLUG_ATTEMPTS: 5,
  DEFAULT_CURRENCY: "USD",
  MAX_ADDRESS_LENGTH: 300,
  INVITATION_TTL_DAYS: 14,
  INVITABLE_ROLES: ["MANAGER", "STAFF"] as const,
  DEFAULT_LOCATION_NAME: "Main location",
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
  MAX_CUSTOMER_SEARCH_LENGTH: 100,
  MAX_PHONE_LENGTH: 32,
  PHONE_PATTERN: /^\+?[0-9 ()-]{6,32}$/,
} as const;

export const CATALOG_CONSTANTS = {
  MAX_CATEGORY_NAME_LENGTH: 80,
  MIN_SERVICE_NAME_LENGTH: 2,
  MAX_SERVICE_NAME_LENGTH: 120,
  MAX_DESCRIPTION_LENGTH: 2_000,
  MIN_DURATION_MINUTES: 5,
  MAX_DURATION_MINUTES: 720,
  MAX_BUFFER_MINUTES: 240,
  MAX_PRICE_MINOR: 100_000_000,
  MAX_CLASS_CAPACITY: 500,
  MAX_SEARCH_LENGTH: 100,
  MAX_SEARCH_RESULTS: 10,
  SEARCH_SIMILARITY_THRESHOLD: 0.2,
} as const;

export const STAFF_CONSTANTS = {
  MIN_DISPLAY_NAME_LENGTH: 2,
  MAX_DISPLAY_NAME_LENGTH: 80,
  MAX_BIO_LENGTH: 1_000,
  MAX_AVATAR_URL_LENGTH: 500,
  MAX_RESOURCE_NAME_LENGTH: 80,
  MAX_RESOURCE_CAPACITY: 500,
  MAX_ASSIGNMENTS: 200,
} as const;

export const AVAILABILITY_CONSTANTS = {
  MAX_RANGE_DAYS: 31,
  MAX_WORKING_HOURS_ROWS: 50,
  MAX_TIME_OFF_DAYS: 366,
  MAX_REASON_LENGTH: 200,
  MINUTES_PER_DAY: 1_440,
  MINUTES_PER_WEEK: 10_080,
} as const;

export const BOOKING_CONSTANTS = {
  ACTIVE_STATUSES: ["HELD", "PENDING_PAYMENT", "PENDING", "CONFIRMED", "CHECKED_IN"] as const,
  CUSTOMER_CHANGEABLE_STATUSES: ["PENDING", "CONFIRMED"] as const,
  CLASS_SESSION_KEY_PREFIX: "class",
  MAX_CANCEL_REASON_LENGTH: 500,
  MAX_NOTES_LENGTH: 2_000,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MAX_LIST_RANGE_DAYS: 92,
  ALTERNATIVE_SLOT_COUNT: 3,
  EXCLUSION_VIOLATION_CODE: "23P01",
  AGGREGATE_TYPE: "booking",
} as const;

export const JOB_CONSTANTS = {
  QUEUES: {
    OUTBOX: "outbox-events",
    MAINTENANCE: "booking-maintenance",
  },
  MAINTENANCE_JOBS: {
    EXPIRE_HOLDS: "expire-holds",
    MARK_NO_SHOWS: "mark-no-shows",
    COMPLETE_VISITS: "complete-visits",
  },
  EXPIRE_HOLDS_EVERY_MS: 60_000,
  MARK_NO_SHOWS_EVERY_MS: 5 * 60_000,
  COMPLETE_VISITS_EVERY_MS: 5 * 60_000,
  /** A checked-in visit is completed automatically this long after it ends. */
  AUTO_COMPLETE_AFTER_MINUTES: 60,
  MAINTENANCE_BATCH_SIZE: 200,
  DEFAULT_OUTBOX_RELAY_INTERVAL_MS: 1_000,
  OUTBOX_BATCH_SIZE: 100,
  OUTBOX_MAX_ATTEMPTS: 10,
  PROCESSED_EVENT_TTL_SECONDS: 7 * 24 * 60 * 60,
  /** How long a consumer may hold an event before another delivery may retry it. */
  CONSUMER_CLAIM_TTL_SECONDS: 5 * 60,
  JOB_ATTEMPTS: 5,
  JOB_BACKOFF_MS: 2_000,
  KEEP_COMPLETED_JOBS: 1_000,
  KEEP_FAILED_JOBS: 5_000,
  DEFAULT_AVAILABILITY_CACHE_TTL_SECONDS: 60,
  /** Outlives every cached entry, so an expired version never resurrects stale data. */
  CACHE_VERSION_TTL_SECONDS: 24 * 60 * 60,
  REDIS_KEY_PREFIX: "bookwise",
  REDIS_REQUEST_RETRIES: 2,
  REDIS_COMMAND_TIMEOUT_MS: 500,
} as const;

export const OBSERVABILITY_CONSTANTS = {
  API_SERVICE_NAME: "bookwise-api",
  WORKER_SERVICE_NAME: "bookwise-worker",
  METER_NAME: "bookwise",
  TRACER_NAME: "bookwise",
  /** Requests that are too frequent and too boring to trace. */
  UNTRACED_PATHS: ["/api/health"],
  REQUEST_ID_ATTRIBUTE: "http.request_id",
  BUSINESS_ID_ATTRIBUTE: "bookwise.business_id",
  /** Latency buckets in seconds for HTTP-scale work. */
  LATENCY_BUCKETS_SECONDS: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30],
  /** Hold-to-confirm buckets in seconds: from instant to the longest hold. */
  HOLD_TO_CONFIRM_BUCKETS_SECONDS: [5, 15, 30, 60, 120, 300, 600, 1_800, 3_600],
  /**
   * Estimated Mistral list prices in USD per million tokens, matched by model
   * family prefix. Used only for the cost metric; update when prices change.
   */
  LLM_PRICING_USD_PER_MILLION: [
    { prefix: "mistral-large", input: 2, output: 6 },
    { prefix: "mistral-medium", input: 0.4, output: 2 },
    { prefix: "mistral-small", input: 0.1, output: 0.3 },
    { prefix: "ministral", input: 0.1, output: 0.1 },
    { prefix: "open-mistral-nemo", input: 0.15, output: 0.15 },
  ],
} as const;

export const TENANT_SCOPE_FIELDS = {
  Location: ["businessId"],
  ServiceCategory: ["businessId"],
  Service: ["businessId"],
  Staff: ["businessId"],
  Resource: ["businessId"],
  WorkingHours: ["businessId"],
  TimeOff: ["businessId"],
  BusinessClosure: ["businessId"],
  Customer: ["businessId"],
  BusinessInvitation: ["businessId", "email"],
  Membership: ["businessId", "userId"],
  Booking: ["businessId", "userId"],
  BookingEvent: ["businessId", "bookingId"],
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
  SERVICE_SUGGESTION_COUNT: 6,
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
    CONFIRMATION_SUFFIX: "Please confirm to book it.",
    BOOKING_SUCCESS_PREFIX: "Your appointment has been booked",
    BOOKING_PENDING_PREFIX: "Your request has been sent for approval",
    NO_ONLINE_SERVICES: "This business has no services open for online booking yet.",
    NO_OPEN_TIMES:
      "There are no open times for that service in the next few weeks. Please try another service or contact the business.",
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
  SESSION_EXPIRED: "SESSION_EXPIRED",
  INVALID_AUTH_LINK: "INVALID_AUTH_LINK",
  INVALID_PHONE_CODE: "INVALID_PHONE_CODE",
  INVALID_PHONE_NUMBER: "INVALID_PHONE_NUMBER",
  PHONE_ALREADY_IN_USE: "PHONE_ALREADY_IN_USE",
  PHONE_CODE_RECENTLY_SENT: "PHONE_CODE_RECENTLY_SENT",
  SMS_NOT_CONFIGURED: "SMS_NOT_CONFIGURED",
  GOOGLE_NOT_CONFIGURED: "GOOGLE_NOT_CONFIGURED",
  CROSS_SITE_REQUEST: "CROSS_SITE_REQUEST",
  AI_INVALID_RESPONSE: "AI_INVALID_RESPONSE",
  AI_NOT_CONFIGURED: "AI_NOT_CONFIGURED",
  AI_PROVIDER_UNAVAILABLE: "AI_PROVIDER_UNAVAILABLE",
  AI_REQUEST_TIMEOUT: "AI_REQUEST_TIMEOUT",
  BUSINESS_NOT_FOUND: "BUSINESS_NOT_FOUND",
  BUSINESS_SLUG_TAKEN: "BUSINESS_SLUG_TAKEN",
  CUSTOMER_ALREADY_EXISTS: "CUSTOMER_ALREADY_EXISTS",
  LOCATION_NOT_FOUND: "LOCATION_NOT_FOUND",
  MEMBER_ALREADY_EXISTS: "MEMBER_ALREADY_EXISTS",
  MEMBER_NOT_FOUND: "MEMBER_NOT_FOUND",
  MEMBER_CHANGE_NOT_ALLOWED: "MEMBER_CHANGE_NOT_ALLOWED",
  INVITATION_NOT_FOUND: "INVITATION_NOT_FOUND",
  SERVICE_NOT_FOUND: "SERVICE_NOT_FOUND",
  STAFF_NOT_FOUND: "STAFF_NOT_FOUND",
  STAFF_ALREADY_LINKED: "STAFF_ALREADY_LINKED",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  TIME_OFF_NOT_FOUND: "TIME_OFF_NOT_FOUND",
  CLOSURE_NOT_FOUND: "CLOSURE_NOT_FOUND",
  CLOSURE_ALREADY_EXISTS: "CLOSURE_ALREADY_EXISTS",
  RESOURCE_ALREADY_EXISTS: "RESOURCE_ALREADY_EXISTS",
  SERVICE_CATEGORY_NOT_FOUND: "SERVICE_CATEGORY_NOT_FOUND",
  SERVICE_CATEGORY_ALREADY_EXISTS: "SERVICE_CATEGORY_ALREADY_EXISTS",
  APPOINTMENT_NOT_FOUND: "APPOINTMENT_NOT_FOUND",
  APPOINTMENT_CANCELLATION_NOT_ALLOWED:
    "APPOINTMENT_CANCELLATION_NOT_ALLOWED",
  APPOINTMENT_RESCHEDULE_NOT_ALLOWED: "APPOINTMENT_RESCHEDULE_NOT_ALLOWED",
  APPOINTMENT_SLOT_UNAVAILABLE: "APPOINTMENT_SLOT_UNAVAILABLE",
  BOOKING_TRANSITION_NOT_ALLOWED: "BOOKING_TRANSITION_NOT_ALLOWED",
  BOOKING_HOLD_EXPIRED: "BOOKING_HOLD_EXPIRED",
  BOOKING_POLICY_VIOLATION: "BOOKING_POLICY_VIOLATION",
  CLASS_FULL: "CLASS_FULL",
  CUSTOMER_NOT_FOUND: "CUSTOMER_NOT_FOUND",
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
  SESSION_EXPIRED: "Your session has ended. Please sign in again",
  INVALID_AUTH_LINK: "This link is invalid or has expired",
  INVALID_PHONE_CODE: "The code is incorrect or has expired",
  INVALID_PHONE_NUMBER: "Enter the number in international format, for example +447700900123",
  PHONE_ALREADY_IN_USE: "This phone number is linked to another account",
  PHONE_CODE_RECENTLY_SENT: "A code was sent recently. Please wait a minute before asking again",
  SMS_NOT_CONFIGURED: "Text message delivery is not available yet",
  GOOGLE_NOT_CONFIGURED: "Google sign-in is not available",
  CROSS_SITE_REQUEST: "This request must come from the BookWise app",
  AI_INVALID_RESPONSE:
    "The booking assistant couldn’t understand the response. Please retry your message",
  AI_NOT_CONFIGURED: "The AI integration is not configured",
  AI_PROVIDER_UNAVAILABLE:
    "The booking assistant is temporarily unavailable. Please try again",
  AI_REQUEST_TIMEOUT:
    "The booking assistant took too long to respond. Please try again",
  BUSINESS_NOT_FOUND: "Business was not found",
  BUSINESS_SLUG_TAKEN: "This booking link is already in use",
  CUSTOMER_ALREADY_EXISTS: "A customer with this email already exists",
  LOCATION_NOT_FOUND: "Location was not found",
  MEMBER_ALREADY_EXISTS: "This person is already a member of the business",
  MEMBER_NOT_FOUND: "Team member was not found",
  MEMBER_CHANGE_NOT_ALLOWED:
    "The business owner cannot be removed or changed",
  INVITATION_NOT_FOUND: "Invitation was not found",
  SERVICE_NOT_FOUND: "Service was not found",
  STAFF_NOT_FOUND: "Staff member was not found",
  STAFF_ALREADY_LINKED: "This team member already has a staff profile",
  RESOURCE_NOT_FOUND: "Resource was not found",
  TIME_OFF_NOT_FOUND: "Time off was not found",
  CLOSURE_NOT_FOUND: "Closure was not found",
  CLOSURE_ALREADY_EXISTS: "The business is already closed on this date",
  RESOURCE_ALREADY_EXISTS: "A resource with this name already exists at this location",
  SERVICE_CATEGORY_NOT_FOUND: "Service category was not found",
  SERVICE_CATEGORY_ALREADY_EXISTS: "A category with this name already exists",
  APPOINTMENT_NOT_FOUND: "Appointment was not found",
  APPOINTMENT_CANCELLATION_NOT_ALLOWED:
    "This appointment can no longer be cancelled",
  APPOINTMENT_RESCHEDULE_NOT_ALLOWED:
    "Only upcoming confirmed or pending appointments can be rescheduled",
  APPOINTMENT_SLOT_UNAVAILABLE: "The selected time is no longer available",
  BOOKING_TRANSITION_NOT_ALLOWED: "This booking cannot change to that status",
  BOOKING_HOLD_EXPIRED: "Your hold on this time has expired and the slot was taken",
  BOOKING_POLICY_VIOLATION: "This change is not allowed by the business's booking policy",
  CLASS_FULL: "This class is full",
  CUSTOMER_NOT_FOUND: "Customer was not found",
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
  BUSINESS_CURRENCY: "Currency must be a supported ISO 4217 code",
  BUSINESS_NAME: "Business name must contain between 2 and 120 characters",
  BUSINESS_SETTINGS: "Business settings contain an invalid value",
  BUSINESS_SLUG:
    "Booking link may contain lowercase letters, numbers and hyphens only",
  BUSINESS_TIME_ZONE: "Time zone must be a valid IANA time zone",
  CUSTOMER_EMAIL: "Customer email must be a valid email address",
  CUSTOMER_NAME: "Customer name must contain between 2 and 120 characters",
  CUSTOMER_PHONE: "Phone number must contain 6 to 32 digits",
  LOCATION_ADDRESS: "Address cannot exceed 300 characters",
  LOCATION_NAME: "Location name must contain between 2 and 120 characters",
  RESOURCE_ID: "Identifier must be a valid UUID",
  BOOKING_CUSTOMER: "Choose an existing customer or enter a new customer's name",
  BOOKING_LIST_RANGE: "Choose a valid date range of at most 92 days",
  BOOKING_START: "Start time must be a valid future date and time",
  CANCEL_REASON: "Reason cannot exceed 500 characters",
  AVAILABILITY_RANGE:
    "Choose a valid date range of at most 31 days, with the end on or after the start",
  CLOSURE_DATE: "Date must be a valid calendar date in YYYY-MM-DD format",
  REASON: "Reason cannot exceed 200 characters",
  TIME_OFF_RANGE: "Time off must end after it starts and last at most a year",
  WORKING_HOURS_OVERLAP: "Working hours for the same person cannot overlap",
  WORKING_HOURS_TIME: "Use HH:mm times; an end at or before the start means the shift ends the next day",
  WORKING_HOURS_WEEKDAY: "Weekday must be between 1 (Monday) and 7 (Sunday)",
  RESOURCE_CAPACITY: "Capacity must be a whole number between 1 and 500",
  RESOURCE_NAME: "Resource name must contain between 1 and 80 characters",
  STAFF_AVATAR_URL: "Avatar must be an https URL of at most 500 characters",
  STAFF_BIO: "Bio cannot exceed 1000 characters",
  STAFF_DISPLAY_NAME: "Name must contain between 2 and 80 characters",
  STAFF_MEMBER: "Linked user must be a member of this business",
  UNKNOWN_REFERENCES: "One or more selected items do not belong to this business",
  SERVICE_BUFFER: "Buffers must be whole minutes between 0 and 240",
  SERVICE_CAPACITY:
    "Classes need between 1 and 500 seats; appointments always have 1",
  SERVICE_CATEGORY_NAME: "Category name must contain between 1 and 80 characters",
  SERVICE_DEPOSIT: "Deposit cannot be negative or exceed the price",
  SERVICE_DESCRIPTION: "Description cannot exceed 2000 characters",
  SERVICE_DURATION: "Duration must be whole minutes between 5 and 720",
  SERVICE_NAME: "Service name must contain between 2 and 120 characters",
  SERVICE_PRICE: "Price must be a whole number of minor units, 0 or more",
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
