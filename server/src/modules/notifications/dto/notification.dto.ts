import type { BookingStatus } from "../../bookings/dto/booking.dto.js";
import type { BusinessSettings } from "../../businesses/dto/business.dto.js";

export type NotificationChannel = "EMAIL" | "SMS";

export type NotificationKind =
  | "BOOKING_CONFIRMED"
  | "BOOKING_REQUESTED"
  | "BOOKING_RESCHEDULED"
  | "BOOKING_CANCELLED"
  | "BOOKING_REMINDER";

export type NotificationStatus = "PENDING" | "SENT" | "DELIVERED" | "FAILED" | "SKIPPED";

export interface NotificationTemplateVariable {
  name: string;
  description: string;
}

export interface NotificationTemplateResponse {
  channel: NotificationChannel;
  kind: NotificationKind;
  /** Email only. */
  subject: string | null;
  body: string;
  /** False while the built-in wording is in use. */
  isCustom: boolean;
}

export interface NotificationTemplateListResponse {
  items: NotificationTemplateResponse[];
  /** Placeholders a template may use, written as {{name}}. */
  variables: NotificationTemplateVariable[];
}

export interface UpdateNotificationTemplateRequest {
  /** Required for email; ignored for SMS. @maxLength 200 */
  subject?: string;
  /** @minLength 1 @maxLength 4000 */
  body: string;
}

export interface BookingNotificationResponse {
  id: string;
  channel: NotificationChannel;
  kind: NotificationKind;
  status: NotificationStatus;
  recipient: string;
  error: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
}

export interface BookingNotificationListResponse {
  items: BookingNotificationResponse[];
}

export interface NotificationSettingsBusiness {
  id: string;
  name: string;
  slug: string;
}

/** Whether one business may message the signed-in user, per channel. */
export interface MyBusinessNotificationSettings {
  business: NotificationSettingsBusiness;
  email: boolean;
  sms: boolean;
}

export interface MyNotificationSettingsResponse {
  items: MyBusinessNotificationSettings[];
}

export interface UpdateMyNotificationSettingRequest {
  channel: NotificationChannel;
  optedIn: boolean;
}

/** Everything needed to write and address one booking's messages. */
export interface BookingNotificationContext {
  bookingId: string;
  businessId: string;
  status: BookingStatus;
  scheduledAt: Date;
  endsAt: Date;
  timeZone: string;
  serviceName: string;
  rescheduleCount: number;
  staffName: string | null;
  location: { name: string; address: string | null } | null;
  business: { name: string; slug: string; settings: BusinessSettings };
  customer: {
    id: string;
    name: string;
    email: string | null;
    /** E.164 when known, from a verified account phone or the customer record. */
    phone: string | null;
    optedOut: Set<NotificationChannel>;
  };
}

export interface BookingNotificationContextRecord {
  id: string;
  businessId: string;
  status: BookingStatus;
  scheduledAt: Date;
  endsAt: Date;
  timeZone: string;
  serviceName: string;
  rescheduleCount: number;
  staff: { displayName: string } | null;
  service: { location: { name: string; address: string | null } | null } | null;
  business: {
    name: string;
    slug: string;
    settings: unknown;
    locations: Array<{ name: string; address: string | null }>;
  };
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    user: { email: string; phone: string | null; phoneVerifiedAt: Date | null } | null;
    notificationPreferences: Array<{ channel: NotificationChannel; optedIn: boolean }>;
  };
}

export interface NotificationTemplateRecord {
  channel: NotificationChannel;
  kind: NotificationKind;
  subject: string | null;
  body: string;
}

export interface ClaimNotificationData {
  businessId: string;
  bookingId: string;
  customerId: string;
  channel: NotificationChannel;
  kind: NotificationKind;
  recipient: string;
  dedupeKey: string;
  /** SKIPPED records an opt-out without sending. */
  status: "PENDING" | "SKIPPED";
}

/** A claimed message: send it only when `send` is true. */
export interface NotificationClaim {
  id: string;
  send: boolean;
}

/** What a reminder job carries; checked against the booking before sending. */
export interface ReminderJobData {
  bookingId: string;
  businessId: string;
  offsetMinutes: number;
  /** The start the reminder was planned for; a moved booking makes it stale. */
  scheduledAt: string;
}

export interface PlannedReminder {
  offsetMinutes: number;
  sendAt: Date;
}

export interface UserNotificationSettingsRecord {
  customerId: string;
  business: NotificationSettingsBusiness;
  preferences: Array<{ channel: NotificationChannel; optedIn: boolean }>;
}
