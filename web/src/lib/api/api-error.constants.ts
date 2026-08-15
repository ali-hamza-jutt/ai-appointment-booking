export const API_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  AI_INVALID_RESPONSE:
    "The booking assistant returned an unexpected response. Try again or complete the booking form.",
  AI_NOT_CONFIGURED:
    "The booking assistant is temporarily unavailable. Try again later or complete the booking form.",
  AI_PROVIDER_UNAVAILABLE:
    "The booking assistant is temporarily unavailable. Try again later or complete the booking form.",
  AI_REQUEST_TIMEOUT:
    "The booking assistant took too long to respond. Try again or complete the booking form.",
  APPOINTMENT_NOT_FOUND: "This appointment could not be found.",
  APPOINTMENT_SLOT_UNAVAILABLE:
    "An appointment already exists at the selected time.",
  CHAT_BOOKING_CONTEXT_INCOMPLETE:
    "Complete the service, date, and time before confirming the booking.",
  CHAT_MESSAGE_ALREADY_EXISTS:
    "This message was already submitted. Refresh the conversation and try again.",
  CHAT_SESSION_CLOSED: "This conversation is already closed.",
  CHAT_SESSION_NOT_ACTIVE: "This conversation is no longer active.",
  CHAT_SESSION_NOT_FOUND: "This conversation could not be found.",
  EMAIL_ALREADY_EXISTS: "An account with this email already exists.",
  INSUFFICIENT_SCOPE: "You do not have permission to perform this action.",
  INVALID_CREDENTIALS: "Invalid email or password.",
  INVALID_FULL_NAME: "Full name must contain at least 2 characters.",
  INVALID_JSON_BODY: "The request contained invalid information.",
  INVALID_PAGINATION_CURSOR:
    "This page could not be loaded. Refresh and try again.",
  INVALID_TOKEN: "Your session has expired. Sign in again.",
  INTERNAL_SERVER_ERROR: "Something went wrong. Please try again.",
  RATE_LIMIT_EXCEEDED: "Too many requests. Please try again later.",
  REQUEST_BODY_TOO_LARGE: "The submitted information is too large.",
  REQUEST_VALIDATION_FAILED:
    "Check the provided information and try again.",
  UNSUPPORTED_AUTHENTICATION: "Your session is invalid. Sign in again.",
  USER_NOT_FOUND: "Your user account could not be found.",
  WEAK_PASSWORD:
    "Password must include an uppercase letter, a lowercase letter, and a number.",
};

export const API_FIELD_ERROR_MESSAGES: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  INVALID_FULL_NAME: {
    fullName: "Full name must contain at least 2 characters.",
  },
  WEAK_PASSWORD: {
    password:
      "Password must include an uppercase letter, a lowercase letter, and a number.",
  },
};

export const DEFAULT_API_FIELD_ERROR_MESSAGE =
  "Check this value and try again.";
