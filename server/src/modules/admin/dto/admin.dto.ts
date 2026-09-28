import type { AuthUserResponse } from "../../auth/dto/auth.dto.js";

export interface AdminBusinessSummary {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  suspension: { at: Date; reason: string | null } | null;
  owner: { id: string; fullName: string; email: string } | null;
  memberCount: number;
  /** Bookings created in the last 30 days, in any state. */
  bookingsLast30Days: number;
  /** Estimated model spend over the last 30 days. */
  llmCostLast30DaysUsd: number;
}

export interface AdminBusinessListResponse {
  items: AdminBusinessSummary[];
}

export interface AdminLlmUsageDay {
  date: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AdminBusinessDetail extends AdminBusinessSummary {
  team: Array<{ userId: string; fullName: string; email: string; role: "OWNER" | "MANAGER" | "STAFF" }>;
  /** The last 30 days, one entry per day with usage. */
  llmUsage: AdminLlmUsageDay[];
  llmUsageByModel: Array<{ model: string; requests: number; costUsd: number }>;
}

export interface SuspendBusinessRequest {
  /** Shown to the business's team. @minLength 3 @maxLength 500 */
  reason: string;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  fullName: string;
  platformRole: "USER" | "ADMIN";
  createdAt: Date;
}

export interface AdminUserListResponse {
  items: AdminUserSummary[];
}

/** A short session as another user; the admin's own session comes back when it ends. */
export interface ImpersonationResponse {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: AuthUserResponse;
}

export interface FailedJobResponse {
  queue: string;
  id: string;
  name: string;
  failedReason: string | null;
  attemptsMade: number;
  failedAt: Date | null;
}

export interface DeadOutboxEventResponse {
  id: string;
  type: string;
  businessId: string | null;
  attempts: number;
  createdAt: Date;
}

export interface FailedWorkResponse {
  /** False when the API has no Redis to inspect queues with. */
  queuesAvailable: boolean;
  jobs: FailedJobResponse[];
  /** Events the relay gave up publishing after too many attempts. */
  outboxEvents: DeadOutboxEventResponse[];
}

export interface AdminAuditEntryResponse {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAt: Date;
  admin: { id: string; fullName: string; email: string };
}

export interface AdminAuditLogResponse {
  items: AdminAuditEntryResponse[];
}
