/**
 * @pattern ^(?:[01]\d|2[0-3]):[0-5]\d$ Must use HH:mm in 24-hour time
 */
export type LocalTime = string;

/**
 * @pattern ^\d{4}-\d{2}-\d{2}$ Must use YYYY-MM-DD
 */
export type LocalDate = string;

export interface WorkingHoursInput {
  /** ISO weekday, 1 = Monday … 7 = Sunday. @isInt @minimum 1 @maximum 7 */
  weekday: number;
  startTime: LocalTime;
  /** An end at or before the start means the shift ends the next day. */
  endTime: LocalTime;
  /** Restrict the shift to one location; omit for any location. */
  locationId?: string | null;
}

export interface ReplaceWorkingHoursRequest {
  /** @maxItems 50 */
  items: WorkingHoursInput[];
}

export interface WorkingHoursReference {
  id: string;
  name: string;
}

export interface WorkingHoursResponse {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  location: WorkingHoursReference | null;
}

export interface WorkingHoursListResponse {
  staffId: string;
  items: WorkingHoursResponse[];
}

export interface TimeOffResponse {
  id: string;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
}

export interface TimeOffListResponse {
  items: TimeOffResponse[];
}

export interface CreateTimeOffRequest {
  startsAt: Date;
  endsAt: Date;
  /** @maxLength 200 */
  reason?: string;
}

export interface ClosureResponse {
  id: string;
  date: string;
  reason: string | null;
}

export interface ClosureListResponse {
  items: ClosureResponse[];
}

export interface CreateClosureRequest {
  date: LocalDate;
  /** @maxLength 200 */
  reason?: string;
}

export interface AvailableSlot {
  startsAt: Date;
  endsAt: Date;
  /** Local start time in the requested time zone. */
  time: string;
  /** Staff who can take this slot. */
  staffIds: string[];
  /** Seats left for class services; null for appointments. */
  seatsLeft: number | null;
}

export interface AvailabilityDay {
  date: string;
  slots: AvailableSlot[];
}

export interface AvailabilityResponse {
  serviceId: string;
  timeZone: string;
  days: AvailabilityDay[];
}

export interface AvailabilityQuery {
  serviceId: string;
  staffId?: string;
  from: string;
  to: string;
  timeZone?: string;
}

export interface WorkingHoursRecord {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  location: WorkingHoursReference | null;
}

export interface WorkingHoursWriteData {
  weekday: number;
  startMinute: number;
  endMinute: number;
  locationId: string | null;
}

export interface AvailabilityServiceRecord {
  id: string;
  name: string;
  priceMinor: number;
  currency: string;
  bookingType: "APPOINTMENT" | "CLASS";
  capacity: number;
  durationMinutes: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  locationId: string | null;
  onlineBookable: boolean;
  policyOverrides: unknown;
  providers: {
    staffId: string;
    customDurationMinutes: number | null;
    customPriceMinor: number | null;
  }[];
  resources: { resource: { id: string; capacity: number; isActive: boolean } }[];
}

export interface AvailabilityStaffRecord {
  id: string;
  locations: { locationId: string }[];
  workingHours: {
    weekday: number;
    startMinute: number;
    endMinute: number;
    locationId: string | null;
    location: { timeZone: string } | null;
  }[];
  timeOff: { startsAt: Date; endsAt: Date }[];
  /** Busy times imported from the staff member's connected calendar. */
  externalBusy: { startsAt: Date; endsAt: Date }[];
}

export interface BookingLoadRecord {
  id: string;
  staffId: string | null;
  serviceId: string | null;
  sessionKey: string;
  seats: number;
  scheduledAt: Date;
  endsAt: Date;
  occupiedFrom: Date;
  occupiedUntil: Date;
}

export interface ResourceLoadRecord {
  sessionKey: string;
  occupiedFrom: Date;
  occupiedUntil: Date;
  resourceIds: string[];
}
