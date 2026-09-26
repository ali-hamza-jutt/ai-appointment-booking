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
  APPOINTMENT_CANCELLATION_NOT_ALLOWED:
    "Completed appointments cannot be cancelled.",
  APPOINTMENT_RESCHEDULE_NOT_ALLOWED:
    "Cancelled or completed appointments cannot be rescheduled.",
  APPOINTMENT_SLOT_UNAVAILABLE:
    "The selected time overlaps with another appointment.",
  BUSINESS_NOT_FOUND: "This business could not be found.",
  BUSINESS_SLUG_TAKEN: "This booking link is already in use. Choose another.",
  CUSTOMER_ALREADY_EXISTS: "A customer with this email already exists.",
  INVITATION_NOT_FOUND: "This invitation no longer exists.",
  LOCATION_NOT_FOUND: "This location could not be found.",
  MEMBER_ALREADY_EXISTS: "This person is already on your team.",
  MEMBER_CHANGE_NOT_ALLOWED: "The business owner cannot be removed or changed.",
  MEMBER_NOT_FOUND: "This team member could not be found.",
  SERVICE_CATEGORY_ALREADY_EXISTS: "A category with this name already exists.",
  SERVICE_CATEGORY_NOT_FOUND: "This category could not be found.",
  SERVICE_NOT_FOUND: "This service could not be found.",
  RESOURCE_ALREADY_EXISTS: "A resource with this name already exists at this location.",
  RESOURCE_NOT_FOUND: "This resource could not be found.",
  STAFF_ALREADY_LINKED: "This team member already has a staff profile.",
  STAFF_NOT_FOUND: "This staff member could not be found.",
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
  BUSINESS_SLUG_TAKEN: {
    slug: "This booking link is already in use. Choose another.",
  },
  CUSTOMER_ALREADY_EXISTS: {
    email: "A customer with this email already exists.",
  },
  SERVICE_CATEGORY_ALREADY_EXISTS: {
    name: "A category with this name already exists.",
  },
  RESOURCE_ALREADY_EXISTS: {
    name: "A resource with this name already exists at this location.",
  },
  STAFF_ALREADY_LINKED: {
    userId: "This team member already has a staff profile.",
  },
  WEAK_PASSWORD: {
    password:
      "Password must include an uppercase letter, a lowercase letter, and a number.",
  },
};

export const DEFAULT_API_FIELD_ERROR_MESSAGE =
  "Check this value and try again.";
