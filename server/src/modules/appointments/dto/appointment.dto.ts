export type AppointmentStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED";

export type AppointmentSource = "FORM" | "CHAT";

export interface CreateAppointmentRequest {
  /** @minLength 2 @maxLength 120 */
  serviceName: string;

  scheduledAt: Date;

  /** IANA time zone in which the appointment was created. @maxLength 100 */
  timeZone: string;

  /**
   * @isInt Duration must be a whole number
   * @minimum 5
   * @maximum 480
   */
  durationMinutes?: number;

  /** @maxLength 2000 */
  notes?: string;
}

export interface AppointmentResponse {
  id: string;
  serviceName: string;
  scheduledAt: Date;
  timeZone: string;
  durationMinutes: number;
  status: AppointmentStatus;
  source: AppointmentSource;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PreparedAppointment {
  serviceName: string;
  scheduledAt: Date;
  timeZone: string;
  durationMinutes: number;
  notes: string | null;
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

export interface AppointmentRecord {
  id: string;
  serviceName: string;
  scheduledAt: Date;
  timeZone: string;
  durationMinutes: number;
  status: AppointmentStatus;
  source: AppointmentSource;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppointmentScheduleData {
  userId: string;
  scheduledAt: Date;
  durationMinutes: number;
  excludeAppointmentId?: string;
}

export interface AppointmentConflictQueryResult {
  hasConflict: boolean;
}

export interface CreateAppointmentData extends AppointmentScheduleData {
  serviceName: string;
  timeZone: string;
  source: AppointmentSource;
  notes: string | null;
}

export interface RescheduleAppointmentRequest {
  /** @pattern ^\d{4}-\d{2}-\d{2}$ Must use YYYY-MM-DD */
  scheduledDate: string;

  /** @pattern ^(?:[01]\d|2[0-3]):[0-5]\d$ Must use HH:mm in 24-hour time */
  scheduledTime: string;
}

export interface AppointmentMutationData {
  appointmentId: string;
  userId: string;
}

export interface RescheduleAppointmentData extends AppointmentMutationData {
  scheduledAt: Date;
  durationMinutes: number;
}

export interface AppointmentPageCursor {
  createdAt: Date;
  id: string;
}

export interface ListAppointmentsData {
  userId: string;
  status?: AppointmentStatus;
  cursor?: AppointmentPageCursor;
  take: number;
}
