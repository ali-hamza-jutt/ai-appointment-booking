import type { BookingStatus } from "../../bookings/dto/booking.dto.js";
import type { CustomerResponse } from "./customer.dto.js";

export type CustomerPreferenceKey =
  | "PREFERRED_STAFF"
  | "USUAL_SERVICE"
  | "PREFERRED_PART_OF_DAY";

/** CUSTOMER: asked for in chat. BOOKING_HISTORY: derived from completed visits. */
export type CustomerPreferenceSource = "CUSTOMER" | "BOOKING_HISTORY";

export type PartOfDay = "morning" | "afternoon" | "evening";

export interface CustomerPreferenceResponse {
  id: string;
  key: CustomerPreferenceKey;
  /** A staff id, a service id or a part of day, depending on key. */
  value: string;
  /** What the value means to a person, for example "Sana" or "Mornings". */
  label: string;
  source: CustomerPreferenceSource;
  updatedAt: Date;
}

export interface CustomerVisitResponse {
  bookingId: string;
  serviceName: string;
  staffName: string | null;
  scheduledAt: Date;
  timeZone: string;
  status: BookingStatus;
}

/** A customer as the business sees them: preferences and visit history. */
export interface CustomerProfileResponse {
  customer: CustomerResponse;
  /** The team's private notes about the customer. */
  notes: string | null;
  preferences: CustomerPreferenceResponse[];
  completedVisits: number;
  noShows: number;
  recentBookings: CustomerVisitResponse[];
}

export interface PreferenceBusiness {
  id: string;
  name: string;
  slug: string;
}

export interface MyBusinessPreferences {
  business: PreferenceBusiness;
  preferences: CustomerPreferenceResponse[];
}

/** What each business remembers about the signed-in user. */
export interface MyPreferencesResponse {
  items: MyBusinessPreferences[];
}

/** The customer facts the booking agent is given at the start of a turn. */
export interface AgentCustomerProfile {
  customerId: string;
  completedVisits: number;
  preferences: Array<{ key: CustomerPreferenceKey; value: string; label: string }>;
  recentBookings: Array<{
    serviceName: string;
    staffName: string | null;
    scheduledAt: Date;
    timeZone: string;
    status: BookingStatus;
  }>;
}

export interface CustomerPreferenceRecord {
  id: string;
  businessId: string;
  customerId: string;
  key: CustomerPreferenceKey;
  value: string;
  source: CustomerPreferenceSource;
  updatedAt: Date;
}

export interface UpsertCustomerPreferenceData {
  businessId: string;
  customerId: string;
  key: CustomerPreferenceKey;
  value: string;
  source: CustomerPreferenceSource;
}

/** A completed visit, as used to derive preferences. */
export interface CustomerHistoryVisit {
  serviceId: string | null;
  staffId: string | null;
  scheduledAt: Date;
  timeZone: string;
}

export interface CustomerVisitRecord {
  id: string;
  serviceName: string;
  scheduledAt: Date;
  timeZone: string;
  status: BookingStatus;
  staff: { displayName: string } | null;
}

export interface CustomerVisitCounts {
  completed: number;
  noShows: number;
}

export interface UserPreferencesRecord {
  customerId: string;
  business: PreferenceBusiness;
  preferences: CustomerPreferenceRecord[];
}
