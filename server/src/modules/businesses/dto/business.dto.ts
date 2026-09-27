import type { EmailAddress } from "../../auth/dto/auth.dto.js";
import type { LocalTime } from "../../availability/dto/availability.dto.js";

export type BusinessVertical =
  | "SALON"
  | "CLINIC"
  | "CONSULTANT"
  | "SPA_WELLNESS"
  | "FITNESS_STUDIO"
  | "TUTORING"
  | "PET_GROOMING";

export type MembershipRole = "OWNER" | "MANAGER" | "STAFF";

export type InvitableMembershipRole = "MANAGER" | "STAFF";

/**
 * @pattern ^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$ Use lowercase letters, numbers and hyphens
 * @maxLength 60
 */
export type BusinessSlug = string;

/**
 * @pattern ^[A-Za-z]{3}$ Use a three-letter ISO 4217 code
 */
export type CurrencyCode = string;

export interface BusinessSettings {
  /** Furthest day ahead a customer can book. */
  bookingWindowDays: number;
  /** Minimum time between booking and the appointment start. */
  minimumNoticeMinutes: number;
  /** Interval between offered start times. */
  slotStepMinutes: number;
  /** Hours before start after which customers can no longer cancel. */
  cancellationWindowHours: number;
  /** Maximum reschedules per booking. */
  rescheduleLimit: number;
  /** Minutes a selected slot is held before it is released. */
  holdMinutes: number;
  /** Minutes after start before a booking without check-in is a no-show. */
  noShowGraceMinutes: number;
  /** Reminder offsets before the appointment, in minutes. */
  reminderOffsetsMinutes: number[];
  allowGuestBooking: boolean;
  autoConfirmBookings: boolean;
  /** Mark confirmed bookings without a check-in as no-shows once the grace period passes. */
  autoMarkNoShows: boolean;
  /**
   * SMS reminders due between these local times (in the customer's time
   * zone) go out when quiet hours start instead. Equal times turn them off.
   */
  quietHoursStart: string;
  quietHoursEnd: string;
}

export interface UpdateBusinessSettingsRequest {
  /** @isInt @minimum 1 @maximum 365 */
  bookingWindowDays?: number;
  /** @isInt @minimum 0 @maximum 10080 */
  minimumNoticeMinutes?: number;
  /** @isInt @minimum 5 @maximum 120 */
  slotStepMinutes?: number;
  /** @isInt @minimum 0 @maximum 720 */
  cancellationWindowHours?: number;
  /** @isInt @minimum 0 @maximum 10 */
  rescheduleLimit?: number;
  /** @isInt @minimum 2 @maximum 60 */
  holdMinutes?: number;
  /** @isInt @minimum 0 @maximum 240 */
  noShowGraceMinutes?: number;
  /** @maxItems 5 */
  reminderOffsetsMinutes?: number[];
  allowGuestBooking?: boolean;
  autoConfirmBookings?: boolean;
  autoMarkNoShows?: boolean;
  quietHoursStart?: LocalTime;
  quietHoursEnd?: LocalTime;
}

export interface CreateBusinessLocationInput {
  /** @minLength 2 @maxLength 120 */
  name: string;
  /** @maxLength 300 */
  address?: string;
}

export interface CreateBusinessRequest {
  /** @minLength 2 @maxLength 120 */
  name: string;
  vertical: BusinessVertical;
  /** IANA time zone the business operates in. @maxLength 100 */
  timeZone: string;
  currency?: CurrencyCode;
  /** Public booking link. Generated from the name when omitted. */
  slug?: BusinessSlug;
  location?: CreateBusinessLocationInput;
}

export interface UpdateBusinessRequest {
  /** @minLength 2 @maxLength 120 */
  name?: string;
  vertical?: BusinessVertical;
  /** @maxLength 100 */
  timeZone?: string;
  currency?: CurrencyCode;
  slug?: BusinessSlug;
}

export interface BusinessResponse {
  id: string;
  slug: string;
  name: string;
  vertical: BusinessVertical;
  timeZone: string;
  currency: string;
  settings: BusinessSettings;
  /** Role of the requesting user in this business. */
  role: MembershipRole | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicBusinessResponse {
  id: string;
  slug: string;
  name: string;
  vertical: BusinessVertical;
  timeZone: string;
  currency: string;
  allowGuestBooking: boolean;
}

export interface BusinessSummaryResponse {
  id: string;
  slug: string;
  name: string;
  vertical: BusinessVertical;
  role: MembershipRole;
}

export interface BusinessListResponse {
  items: BusinessSummaryResponse[];
}

export interface BusinessVerticalResponse {
  id: BusinessVertical;
  label: string;
  description: string;
  providerLabel: string;
  customerLabel: string;
  supportsClasses: boolean;
  suggestedServices: string[];
}

export interface BusinessVerticalListResponse {
  items: BusinessVerticalResponse[];
}

export interface LocationResponse {
  id: string;
  name: string;
  address: string | null;
  timeZone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LocationListResponse {
  items: LocationResponse[];
}

export interface CreateLocationRequest {
  /** @minLength 2 @maxLength 120 */
  name: string;
  /** @maxLength 300 */
  address?: string;
  /** Defaults to the business time zone. @maxLength 100 */
  timeZone?: string;
}

export interface UpdateLocationRequest {
  /** @minLength 2 @maxLength 120 */
  name?: string;
  /** @maxLength 300 */
  address?: string | null;
  /** @maxLength 100 */
  timeZone?: string;
  isActive?: boolean;
}

export interface MemberResponse {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: MembershipRole;
  createdAt: Date;
}

export interface InvitationResponse {
  id: string;
  email: string;
  role: MembershipRole;
  expiresAt: Date;
  createdAt: Date;
}

export interface MemberListResponse {
  members: MemberResponse[];
  invitations: InvitationResponse[];
}

export interface InviteMemberRequest {
  email: EmailAddress;
  role: InvitableMembershipRole;
}

export interface InviteMemberResponse {
  /** Present when the invited email already has an account. */
  member?: MemberResponse;
  /** Present when the person must sign up before joining. */
  invitation?: InvitationResponse;
}

export interface UpdateMemberRoleRequest {
  role: InvitableMembershipRole;
}

export interface BusinessRecord {
  id: string;
  slug: string;
  name: string;
  vertical: BusinessVertical;
  timeZone: string;
  currency: string;
  settings: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicBusinessRecord {
  id: string;
  slug: string;
  name: string;
  vertical: BusinessVertical;
  timeZone: string;
  currency: string;
  settings: unknown;
}

export interface MembershipBusinessRecord {
  role: MembershipRole;
  business: {
    id: string;
    slug: string;
    name: string;
    vertical: BusinessVertical;
  };
}

export interface CreateBusinessData {
  ownerUserId: string;
  slug: string;
  name: string;
  vertical: BusinessVertical;
  timeZone: string;
  currency: string;
  settings: BusinessSettings;
  location: {
    name: string;
    address: string | null;
    timeZone: string;
  };
}

export interface UpdateBusinessData {
  name?: string;
  vertical?: BusinessVertical;
  timeZone?: string;
  currency?: string;
  slug?: string;
  settings?: BusinessSettings;
}

export interface LocationRecord extends LocationResponse {
  businessId: string;
}

export interface CreateLocationData {
  businessId: string;
  name: string;
  address: string | null;
  timeZone: string;
}

export interface UpdateLocationData {
  name?: string;
  address?: string | null;
  timeZone?: string;
  isActive?: boolean;
}

export interface MemberRecord {
  id: string;
  userId: string;
  role: MembershipRole;
  createdAt: Date;
  user: {
    fullName: string;
    email: string;
  };
}

export interface InvitationRecord {
  id: string;
  email: string;
  role: MembershipRole;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateInvitationData {
  businessId: string;
  email: string;
  role: MembershipRole;
  invitedByUserId: string;
  expiresAt: Date;
}

export interface AuthorizationMembershipRecord {
  role: MembershipRole;
}
