import type { EmailAddress } from "../../auth/dto/auth.dto.js";

export interface StaffServiceAssignment {
  serviceId: string;
  /** Overrides the service duration for this person. @isInt @minimum 5 @maximum 720 */
  customDurationMinutes?: number | null;
  /** Overrides the service price for this person. @isInt @minimum 0 @maximum 100000000 */
  customPriceMinor?: number | null;
}

export interface StaffServiceResponse {
  serviceId: string;
  serviceName: string;
  customDurationMinutes: number | null;
  customPriceMinor: number | null;
}

export interface StaffLocationResponse {
  id: string;
  name: string;
}

export interface StaffResponse {
  id: string;
  /** Linked BookWise account, when the staff member signs in themselves. */
  userId: string | null;
  displayName: string;
  email: string | null;
  bio: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  services: StaffServiceResponse[];
  /** Empty means the person works at every location. */
  locations: StaffLocationResponse[];
  createdAt: Date;
  updatedAt: Date;
}

export interface StaffListResponse {
  items: StaffResponse[];
}

export interface CreateStaffRequest {
  /** @minLength 2 @maxLength 80 */
  displayName: string;
  email?: EmailAddress;
  /** @maxLength 1000 */
  bio?: string;
  /** @maxLength 500 */
  avatarUrl?: string;
  /** A member of this business to link, so they can see their own schedule. */
  userId?: string;
  /** @maxItems 200 */
  services?: StaffServiceAssignment[];
  /** @maxItems 200 */
  locationIds?: string[];
  /** @isInt */
  sortOrder?: number;
}

export interface UpdateStaffRequest {
  /** @minLength 2 @maxLength 80 */
  displayName?: string;
  email?: EmailAddress | null;
  /** @maxLength 1000 */
  bio?: string | null;
  /** @maxLength 500 */
  avatarUrl?: string | null;
  userId?: string | null;
  isActive?: boolean;
  /** Replaces the full list of services. @maxItems 200 */
  services?: StaffServiceAssignment[];
  /** Replaces the full list of locations. @maxItems 200 */
  locationIds?: string[];
  /** @isInt */
  sortOrder?: number;
}

export interface PublicStaffResponse {
  id: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
}

export interface PublicStaffListResponse {
  items: PublicStaffResponse[];
}

export interface ResourceResponse {
  id: string;
  name: string;
  capacity: number;
  isActive: boolean;
  location: StaffLocationResponse;
  /** Services that cannot run without this resource. */
  services: StaffLocationResponse[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ResourceListResponse {
  items: ResourceResponse[];
}

export interface CreateResourceRequest {
  /** @minLength 1 @maxLength 80 */
  name: string;
  locationId: string;
  /** @isInt @minimum 1 @maximum 500 */
  capacity?: number;
  /** @maxItems 200 */
  serviceIds?: string[];
}

export interface UpdateResourceRequest {
  /** @minLength 1 @maxLength 80 */
  name?: string;
  locationId?: string;
  /** @isInt @minimum 1 @maximum 500 */
  capacity?: number;
  isActive?: boolean;
  /** Replaces the full list of services. @maxItems 200 */
  serviceIds?: string[];
}

export interface StaffRecord {
  id: string;
  userId: string | null;
  displayName: string;
  email: string | null;
  bio: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  services: {
    customDurationMinutes: number | null;
    customPriceMinor: number | null;
    service: { id: string; name: string };
  }[];
  locations: { location: { id: string; name: string } }[];
}

export interface StaffProfileData {
  displayName: string;
  email: string | null;
  bio: string | null;
  avatarUrl: string | null;
  userId: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface StaffAssignmentData {
  services: {
    serviceId: string;
    customDurationMinutes: number | null;
    customPriceMinor: number | null;
  }[];
  locationIds: string[];
}

export interface ResourceRecord {
  id: string;
  name: string;
  capacity: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  location: { id: string; name: string };
  services: { service: { id: string; name: string } }[];
}

export interface ResourceWriteData {
  name: string;
  locationId: string;
  capacity: number;
  isActive: boolean;
}
