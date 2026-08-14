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
  durationMinutes: number;
  status: AppointmentStatus;
  source: AppointmentSource;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAppointmentData {
  userId: string;
  serviceName: string;
  scheduledAt: Date;
  durationMinutes: number;
  source: AppointmentSource;
  notes: string | null;
}

export interface AppointmentPageCursor {
  id: string;
  scheduledAt: Date;
}

export interface ListAppointmentsData {
  userId: string;
  status?: AppointmentStatus;
  cursor?: AppointmentPageCursor;
  take: number;
}
