export type ReviewStatus = "PENDING" | "PUBLISHED" | "HIDDEN";

export interface SubmitReviewRequest {
  /** 1 to 5 stars. @isInt @minimum 1 @maximum 5 */
  rating: number;
  /** @maxLength 2000 */
  comment?: string;
}

export interface ReviewResponse {
  id: string;
  bookingId: string;
  rating: number;
  comment: string | null;
  /** Only published reviews appear on the booking page. */
  status: ReviewStatus;
  /** The business's public answer. */
  reply: string | null;
  repliedAt: Date | null;
  serviceName: string;
  staff: { id: string; name: string } | null;
  visitedAt: Date;
  createdAt: Date;
}

/** The customer's review of one visit, or whether they can still write one. */
export interface MyReviewResponse {
  canReview: boolean;
  review: ReviewResponse | null;
}

export interface BusinessReviewResponse extends ReviewResponse {
  customer: { id: string; name: string };
}

export interface ReviewSummary {
  /** Average stars, to one decimal place; null with no reviews. */
  average: number | null;
  count: number;
}

export interface BusinessReviewListResponse {
  items: BusinessReviewResponse[];
  /** Every review, published or not. */
  summary: ReviewSummary & { pending: number };
}

export interface ModerateReviewRequest {
  status?: "PUBLISHED" | "HIDDEN";
  /** A public answer; null or empty removes it. @maxLength 2000 */
  reply?: string | null;
}

export interface PublicReviewResponse {
  rating: number;
  comment: string | null;
  reply: string | null;
  serviceName: string;
  /** First name and last initial. */
  author: string;
  createdAt: Date;
}

export interface PublicReviewListResponse extends ReviewSummary {
  items: PublicReviewResponse[];
}

export interface ReviewRecord {
  id: string;
  businessId: string;
  bookingId: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  reply: string | null;
  repliedAt: Date | null;
  createdAt: Date;
  booking: { serviceName: string; scheduledAt: Date; timeZone: string };
  staff: { id: string; displayName: string } | null;
  customer: { id: string; name: string };
  business: { id: string; name: string };
}

export interface CreateReviewData {
  businessId: string;
  bookingId: string;
  customerId: string;
  userId: string;
  serviceId: string | null;
  staffId: string | null;
  rating: number;
  comment: string | null;
}

export interface ReviewPatch {
  status?: ReviewStatus;
  reply?: string | null;
  repliedAt?: Date | null;
}
