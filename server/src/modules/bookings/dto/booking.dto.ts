import type { EmailAddress } from "../../auth/dto/auth.dto.js";

export type BookingStatus =
  | "HELD"
  | "PENDING_PAYMENT"
  | "PENDING"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW"
  | "EXPIRED";

/** Kept for the customer-facing API, which still calls bookings appointments. */
export type AppointmentStatus = BookingStatus;

export type BookingSource = "FORM" | "CHAT" | "STAFF";

/** Kept for the customer-facing API. */
export type AppointmentSource = BookingSource;

export type BookingActorType = "CUSTOMER" | "STAFF" | "SYSTEM";

export type BookingEventType =
  | "HOLD"
  | "REQUIRE_PAYMENT"
  | "CONFIRM"
  | "REQUEST_APPROVAL"
  | "APPROVE"
  | "DECLINE"
  | "EXPIRE"
  | "CHECK_IN"
  | "COMPLETE"
  | "MARK_NO_SHOW"
  | "CANCEL"
  | "RESCHEDULE";

export interface BookingReference {
  id: string;
  name: string;
}

export interface BookingBusinessReference {
  id: string;
  name: string;
  slug: string;
}

/** A booking as its customer sees it. */
export interface AppointmentResponse {
  id: string;
  business: BookingBusinessReference;
  serviceId: string | null;
  serviceName: string;
  staff: BookingReference | null;
  scheduledAt: Date;
  endsAt: Date;
  timeZone: string;
  durationMinutes: number;
  status: AppointmentStatus;
  source: AppointmentSource;
  notes: string | null;
  priceMinor: number | null;
  currency: string | null;
  /** Set while the time is held for confirmation. */
  holdExpiresAt: Date | null;
  cancelReason: string | null;
  rescheduleCount: number;
  /** Whether the business's policy still lets the customer cancel. */
  canCancel: boolean;
  /** Whether the business's policy still lets the customer reschedule. */
  canReschedule: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppointmentListResponse {
  items: AppointmentResponse[];
  nextCursor?: string;
}

export interface ListAppointmentsOptions {
  status?: AppointmentStatus;
  cursor?: string;
  limit?: number;
}

export interface CreateHoldRequest {
  /** Booking link of the business. @maxLength 60 */
  businessSlug: string;
  serviceId: string;
  /** Omit to take any available staff member. */
  staffId?: string;
  startsAt: Date;
  /** @maxLength 2000 */
  notes?: string;
}

export interface CancelAppointmentRequest {
  /** @maxLength 500 */
  reason?: string;
}

export interface RescheduleAppointmentRequest {
  /** @pattern ^\d{4}-\d{2}-\d{2}$ Must use YYYY-MM-DD */
  scheduledDate: string;

  /** @pattern ^(?:[01]\d|2[0-3]):[0-5]\d$ Must use HH:mm in 24-hour time */
  scheduledTime: string;
}

/** A booking as the business sees it. */
export interface BookingResponse {
  id: string;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  serviceId: string | null;
  serviceName: string;
  staff: BookingReference | null;
  scheduledAt: Date;
  endsAt: Date;
  timeZone: string;
  durationMinutes: number;
  seats: number;
  status: BookingStatus;
  source: BookingSource;
  notes: string | null;
  priceMinor: number | null;
  currency: string | null;
  holdExpiresAt: Date | null;
  cancelledBy: BookingActorType | null;
  cancelReason: string | null;
  rescheduleCount: number;
  checkedInAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookingListResponse {
  items: BookingResponse[];
  nextCursor?: string;
}

export interface ListBookingsOptions {
  status?: BookingStatus;
  staffId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

export interface NewCustomerInput {
  /** @minLength 2 @maxLength 120 */
  name: string;
  email?: EmailAddress;
  /** @maxLength 32 */
  phone?: string;
}

export interface CreateStaffBookingRequest {
  /** An existing customer of this business. */
  customerId?: string;
  /** Creates a customer when `customerId` is omitted. */
  customer?: NewCustomerInput;
  serviceId: string;
  /** Omit to take any available staff member. */
  staffId?: string;
  startsAt: Date;
  /** @maxLength 2000 */
  notes?: string;
}

export interface StaffRescheduleRequest {
  startsAt: Date;
  /** Move the booking to another staff member. */
  staffId?: string;
}

export interface BookingEventResponse {
  id: string;
  type: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus | null;
  actorType: BookingActorType;
  actorUserId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

export interface BookingEventListResponse {
  items: BookingEventResponse[];
}

export interface BookingActor {
  type: BookingActorType;
  userId: string | null;
}

export interface BookingRecord {
  id: string;
  businessId: string;
  userId: string | null;
  customerId: string;
  serviceId: string | null;
  staffId: string | null;
  chatSessionId: string | null;
  serviceName: string;
  scheduledAt: Date;
  endsAt: Date;
  timeZone: string;
  durationMinutes: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  occupiedFrom: Date;
  occupiedUntil: Date;
  sessionKey: string;
  seats: number;
  priceMinor: number | null;
  currency: string | null;
  status: BookingStatus;
  source: BookingSource;
  notes: string | null;
  holdExpiresAt: Date | null;
  rescheduleCount: number;
  cancelledBy: BookingActorType | null;
  cancelReason: string | null;
  cancelledAt: Date | null;
  checkedInAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  business: { id: string; name: string; slug: string; settings: unknown };
  customer: { id: string; name: string; email: string | null; phone: string | null };
  staff: { id: string; displayName: string } | null;
  service: { policyOverrides: unknown } | null;
}

export interface NewBookingData {
  id: string;
  businessId: string;
  userId: string | null;
  customerId: string;
  serviceId: string;
  staffId: string;
  chatSessionId: string | null;
  serviceName: string;
  scheduledAt: Date;
  endsAt: Date;
  timeZone: string;
  durationMinutes: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  occupiedFrom: Date;
  occupiedUntil: Date;
  sessionKey: string;
  seats: number;
  priceMinor: number;
  currency: string;
  status: BookingStatus;
  source: BookingSource;
  notes: string | null;
  holdExpiresAt: Date | null;
}

export interface BookingPageCursor {
  timestamp: Date;
  id: string;
}

export interface ListBookingsData {
  businessId: string;
  status?: BookingStatus;
  staffId?: string;
  from?: Date;
  to?: Date;
  cursor?: BookingPageCursor;
  take: number;
}

export interface ListCustomerBookingsData {
  userId: string;
  status?: BookingStatus;
  cursor?: BookingPageCursor;
  take: number;
}

export interface BookableServiceRecord {
  id: string;
  name: string;
  bookingType: "APPOINTMENT" | "CLASS";
  capacity: number;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  onlineBookable: boolean;
  policyOverrides: unknown;
  providers: { staffId: string; customDurationMinutes: number | null; customPriceMinor: number | null }[];
  resources: { resourceId: string }[];
}

/** Everything needed to place a booking on a provider's schedule. */
export interface PlaceBookingInput {
  businessId: string;
  serviceId: string;
  staffId?: string;
  startsAt: Date;
  customerId: string;
  userId: string | null;
  chatSessionId: string | null;
  notes: string | null;
  source: BookingSource;
  actor: BookingActor;
  /** Staff bookings skip the online-bookable, notice and window checks. */
  mode: "CUSTOMER" | "STAFF";
  /** HELD for a customer hold; CONFIRMED for staff bookings. */
  initialStatus: "HELD" | "CONFIRMED";
}
