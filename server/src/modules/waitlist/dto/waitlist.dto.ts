import type { LocalDate } from "../../availability/dto/availability.dto.js";

export type WaitlistStatus = "WAITING" | "OFFERED" | "BOOKED" | "LEFT";

export type WaitlistOfferStatus = "OPEN" | "ACCEPTED" | "LAPSED" | "DECLINED";

export type WaitlistPartOfDay = "morning" | "afternoon" | "evening";

export interface JoinWaitlistRequest {
  /** Booking link of the business. @maxLength 60 */
  businessSlug: string;
  serviceId: string;
  /** Only this provider; leave out for anyone. */
  staffId?: string;
  fromDate: LocalDate;
  toDate: LocalDate;
  partOfDay?: WaitlistPartOfDay;
  /** The customer's IANA time zone, which the dates and part of day are read in. @maxLength 100 */
  timeZone: string;
}

/** A time held for the customer right now, waiting for them to confirm. */
export interface WaitlistOfferResponse {
  bookingId: string;
  startsAt: Date;
  expiresAt: Date;
}

export interface WaitlistEntryResponse {
  id: string;
  business: { id: string; name: string; slug: string };
  service: { id: string; name: string };
  staff: { id: string; name: string } | null;
  fromDate: string;
  toDate: string;
  partOfDay: WaitlistPartOfDay | null;
  timeZone: string;
  status: WaitlistStatus;
  offer: WaitlistOfferResponse | null;
  createdAt: Date;
}

export interface WaitlistListResponse {
  items: WaitlistEntryResponse[];
}

export interface BusinessWaitlistEntryResponse extends WaitlistEntryResponse {
  customer: { id: string; name: string; email: string | null; phone: string | null };
}

export interface BusinessWaitlistListResponse {
  items: BusinessWaitlistEntryResponse[];
}

/** What joining needs once the business is known (from a link or the chat). */
export interface JoinWaitlistInput {
  serviceId: string;
  staffId?: string | undefined;
  fromDate: string;
  toDate: string;
  partOfDay?: string | undefined;
  timeZone: string;
}

export interface WaitlistEntryRecord {
  id: string;
  businessId: string;
  customerId: string;
  userId: string;
  serviceId: string;
  staffId: string | null;
  fromDate: Date;
  toDate: Date;
  partOfDay: string | null;
  timeZone: string;
  status: WaitlistStatus;
  createdAt: Date;
  business: { id: string; name: string; slug: string };
  service: { id: string; name: string };
  staff: { id: string; displayName: string } | null;
  customer: { id: string; name: string; email: string | null; phone: string | null };
  offers: Array<{ bookingId: string; startsAt: Date; expiresAt: Date }>;
}

export interface CreateWaitlistEntryData {
  businessId: string;
  customerId: string;
  userId: string;
  serviceId: string;
  staffId: string | null;
  fromDate: Date;
  toDate: Date;
  partOfDay: string | null;
  timeZone: string;
}

export interface WaitlistOfferRecord {
  id: string;
  businessId: string;
  entryId: string;
  bookingId: string;
  status: WaitlistOfferStatus;
}

/** A time a cancelled or expired booking gave back. */
export interface FreedTime {
  businessId: string;
  serviceId: string;
  staffId: string | null;
  startsAt: Date;
}
