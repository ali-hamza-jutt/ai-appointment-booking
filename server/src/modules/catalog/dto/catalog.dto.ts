import type { ServicePaymentMode } from "../../payments/dto/payment.dto.js";

export type ServiceBookingType = "APPOINTMENT" | "CLASS";

export interface ServiceCategoryResponse {
  id: string;
  name: string;
  sortOrder: number;
}

export interface ServiceCategoryListResponse {
  items: ServiceCategoryResponse[];
}

export interface CreateServiceCategoryRequest {
  /** @minLength 1 @maxLength 80 */
  name: string;
  /** @isInt */
  sortOrder?: number;
}

export interface UpdateServiceCategoryRequest {
  /** @minLength 1 @maxLength 80 */
  name?: string;
  /** @isInt */
  sortOrder?: number;
}

/** Business policies this service overrides; omitted keys use the business setting. */
export interface ServicePolicyOverrides {
  /** @isInt @minimum 0 @maximum 10080 */
  minimumNoticeMinutes?: number;
  /** @isInt @minimum 1 @maximum 365 */
  bookingWindowDays?: number;
  /** @isInt @minimum 0 @maximum 720 */
  cancellationWindowHours?: number;
  /** @isInt @minimum 0 @maximum 10 */
  rescheduleLimit?: number;
}

export interface ServiceReference {
  id: string;
  name: string;
}

export interface ServiceResponse {
  id: string;
  name: string;
  description: string | null;
  category: ServiceReference | null;
  location: ServiceReference | null;
  /** APPOINTMENT books one customer; CLASS sells `capacity` seats per slot. */
  bookingType: ServiceBookingType;
  capacity: number;
  durationMinutes: number;
  /** Price in minor units (for example cents). */
  priceMinor: number;
  currency: string;
  depositMinor: number | null;
  paymentMode: ServicePaymentMode;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  isActive: boolean;
  onlineBookable: boolean;
  sortOrder: number;
  policyOverrides: ServicePolicyOverrides;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceListResponse {
  items: ServiceResponse[];
}

export interface CreateServiceRequest {
  /** @minLength 2 @maxLength 120 */
  name: string;
  /** @maxLength 2000 */
  description?: string;
  categoryId?: string;
  /** Restricts the service to one location; omit for every location. */
  locationId?: string;
  bookingType?: ServiceBookingType;
  /** @isInt @minimum 1 @maximum 500 */
  capacity?: number;
  /** @isInt @minimum 5 @maximum 720 */
  durationMinutes: number;
  /** @isInt @minimum 0 @maximum 100000000 */
  priceMinor: number;
  /** @isInt @minimum 0 @maximum 100000000 */
  depositMinor?: number;
  /** DEPOSIT asks for depositMinor online when booking, FULL for the whole price. Needs the business's Stripe account. */
  paymentMode?: ServicePaymentMode;
  /** @isInt @minimum 0 @maximum 240 */
  bufferBeforeMin?: number;
  /** @isInt @minimum 0 @maximum 240 */
  bufferAfterMin?: number;
  onlineBookable?: boolean;
  /** @isInt */
  sortOrder?: number;
  policyOverrides?: ServicePolicyOverrides;
}

export interface UpdateServiceRequest {
  /** @minLength 2 @maxLength 120 */
  name?: string;
  /** @maxLength 2000 */
  description?: string | null;
  categoryId?: string | null;
  locationId?: string | null;
  bookingType?: ServiceBookingType;
  /** @isInt @minimum 1 @maximum 500 */
  capacity?: number;
  /** @isInt @minimum 5 @maximum 720 */
  durationMinutes?: number;
  /** @isInt @minimum 0 @maximum 100000000 */
  priceMinor?: number;
  /** @isInt @minimum 0 @maximum 100000000 */
  depositMinor?: number | null;
  paymentMode?: ServicePaymentMode;
  /** @isInt @minimum 0 @maximum 240 */
  bufferBeforeMin?: number;
  /** @isInt @minimum 0 @maximum 240 */
  bufferAfterMin?: number;
  isActive?: boolean;
  onlineBookable?: boolean;
  /** @isInt */
  sortOrder?: number;
  /** Replaces all overrides; send {} to clear them. */
  policyOverrides?: ServicePolicyOverrides;
}

export interface PublicServiceResponse {
  id: string;
  name: string;
  description: string | null;
  categoryName: string | null;
  bookingType: ServiceBookingType;
  capacity: number;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  depositMinor: number | null;
}

export interface PublicServiceListResponse {
  items: PublicServiceResponse[];
}

export interface ServiceCategoryRecord {
  id: string;
  name: string;
  sortOrder: number;
}

export interface ServiceRecord {
  id: string;
  name: string;
  description: string | null;
  bookingType: ServiceBookingType;
  capacity: number;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  depositMinor: number | null;
  paymentMode: ServicePaymentMode;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  isActive: boolean;
  onlineBookable: boolean;
  sortOrder: number;
  policyOverrides: unknown;
  createdAt: Date;
  updatedAt: Date;
  category: ServiceReference | null;
  location: ServiceReference | null;
}

export interface ServiceWriteData {
  name: string;
  description: string | null;
  categoryId: string | null;
  locationId: string | null;
  bookingType: ServiceBookingType;
  capacity: number;
  durationMinutes: number;
  priceMinor: number;
  depositMinor: number | null;
  paymentMode: ServicePaymentMode;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  isActive: boolean;
  onlineBookable: boolean;
  sortOrder: number;
  policyOverrides: ServicePolicyOverrides;
}

export interface CreateServiceData extends ServiceWriteData {
  businessId: string;
  currency: string;
}

export interface PublicServiceRecord {
  id: string;
  name: string;
  description: string | null;
  categoryName: string | null;
  bookingType: ServiceBookingType;
  capacity: number;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  depositMinor: number | null;
}
