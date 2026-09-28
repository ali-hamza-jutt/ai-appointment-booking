import type { EmailAddress } from "../../auth/dto/auth.dto.js";

export interface CustomerResponse {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** True when the customer has a BookWise account. */
  hasAccount: boolean;
  createdAt: Date;
}

export interface CustomerListResponse {
  items: CustomerResponse[];
  nextCursor?: string;
}

export interface CreateCustomerRequest {
  /** @minLength 2 @maxLength 120 */
  name: string;
  email?: EmailAddress;
  /** @maxLength 32 */
  phone?: string;
}

export interface UpdateCustomerNotesRequest {
  /** Private to the team; null or empty clears them. @maxLength 2000 */
  notes: string | null;
}

export interface ListCustomersOptions {
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface CustomerRecord {
  id: string;
  userId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface CreateCustomerData {
  businessId: string;
  userId?: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface ListCustomersData {
  businessId: string;
  search?: string;
  cursor?: { createdAt: Date; id: string };
  take: number;
}
