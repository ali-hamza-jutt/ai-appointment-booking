import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  REVIEW_CONSTANTS,
  VALIDATION_PATTERNS,
} from "../../constants/app.constants.js";
import { mailer, type Mailer } from "../../infrastructure/messaging/mailer.js";
import { AppError } from "../../middleware/app-error.js";
import { isUniqueConstraintError } from "../../utils/database.js";
import { assertUuid } from "../../utils/identifiers.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { bookingDal } from "../bookings/dal/booking.dal.js";
import { businessService } from "../businesses/business.service.js";
import type { OutboxMessage } from "../outbox/dto/outbox.dto.js";
import { reviewDal } from "./dal/review.dal.js";
import type {
  BusinessReviewListResponse,
  BusinessReviewResponse,
  ModerateReviewRequest,
  MyReviewResponse,
  PublicReviewListResponse,
  ReviewPatch,
  ReviewRecord,
  ReviewResponse,
  ReviewStatus,
  SubmitReviewRequest,
} from "./dto/review.dto.js";

const DAY = 24 * 60 * 60 * 1_000;
const STATUSES: ReviewStatus[] = ["PENDING", "PUBLISHED", "HIDDEN"];

/** Trimmed text, or null when nothing is left. */
function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

/** "Maria Lopez" → "Maria L." */
function authorName(name: string): string {
  const [first = "", ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);

  return last ? `${first} ${last[0]?.toUpperCase() ?? ""}.` : first || "A customer";
}

/**
 * Ratings of finished visits. Customers rate a visit once, within 30 days;
 * the business publishes the ones that appear on its booking page, can answer
 * them, and hears straight away about low ratings.
 */
export class ReviewService {
  public constructor(private readonly email: Mailer = mailer) {}

  public async getMine(userId: string, bookingId: string, now: Date = new Date()): Promise<MyReviewResponse> {
    const booking = await this.getOwnedBooking(userId, bookingId);
    const review = await reviewDal.findForBooking(booking.businessId, booking.id);

    return {
      canReview: !review && this.isReviewable(booking, now),
      review: review ? this.toResponse(review) : null,
    };
  }

  public async submit(
    userId: string,
    bookingId: string,
    request: SubmitReviewRequest,
    now: Date = new Date(),
  ): Promise<ReviewResponse> {
    if (!Number.isInteger(request.rating) || request.rating < 1 || request.rating > 5) {
      throwRequestValidationError("rating", "Rating must be a whole number from 1 to 5");
    }

    const booking = await this.getOwnedBooking(userId, bookingId);

    if (await reviewDal.existsForBooking(booking.businessId, booking.id)) this.throwAlreadyReviewed();
    if (!this.isReviewable(booking, now)) {
      throw new AppError(409, ERROR_CODES.REVIEW_NOT_ALLOWED, ERROR_MESSAGES.REVIEW_NOT_ALLOWED);
    }

    try {
      const review = await reviewDal.create({
        businessId: booking.businessId,
        bookingId: booking.id,
        customerId: booking.customerId,
        userId,
        serviceId: booking.serviceId,
        staffId: booking.staffId,
        rating: request.rating,
        comment: cleanText(request.comment),
      });

      return this.toResponse(review);
    } catch (error) {
      // Two submits raced; the first one counts.
      if (isUniqueConstraintError(error)) this.throwAlreadyReviewed();
      throw error;
    }
  }

  public async listForBusiness(businessId: string, status?: string): Promise<BusinessReviewListResponse> {
    if (status !== undefined && !STATUSES.includes(status as ReviewStatus)) {
      throwRequestValidationError("status", "Status must be PENDING, PUBLISHED or HIDDEN");
    }

    const [reviews, summary, pending] = await Promise.all([
      reviewDal.listForBusiness(businessId, status as ReviewStatus | undefined, REVIEW_CONSTANTS.LIST_LIMIT),
      reviewDal.summarize(businessId),
      reviewDal.countPending(businessId),
    ]);

    return { items: reviews.map((review) => this.toBusinessResponse(review)), summary: { ...summary, pending } };
  }

  /** Publishes or hides a review, and sets or removes the business's answer. */
  public async moderate(
    businessId: string,
    reviewId: string,
    request: ModerateReviewRequest,
    now: Date = new Date(),
  ): Promise<BusinessReviewResponse> {
    const existing = VALIDATION_PATTERNS.UUID.test(reviewId) ? await reviewDal.findById(businessId, reviewId) : null;

    if (!existing) throw new AppError(404, ERROR_CODES.REVIEW_NOT_FOUND, ERROR_MESSAGES.REVIEW_NOT_FOUND);

    const patch: ReviewPatch = {};

    if (request.status !== undefined) patch.status = request.status;
    if (request.reply !== undefined) {
      const reply = cleanText(request.reply);

      patch.reply = reply;
      patch.repliedAt = reply ? now : null;
    }

    return this.toBusinessResponse(await reviewDal.update(businessId, existing.id, patch));
  }

  /** Published reviews behind a booking link, newest first. */
  public async listPublic(slug: string): Promise<PublicReviewListResponse> {
    const business = await businessService.getPublicBusiness(slug);

    return this.listPublished(business.id);
  }

  public async listPublished(businessId: string, limit: number = REVIEW_CONSTANTS.PUBLIC_LIMIT): Promise<PublicReviewListResponse> {
    const [reviews, summary] = await Promise.all([
      reviewDal.listPublished(businessId, limit),
      reviewDal.summarize(businessId, "PUBLISHED"),
    ]);

    return {
      ...summary,
      items: reviews.map((review) => ({
        rating: review.rating,
        comment: review.comment,
        reply: review.reply,
        serviceName: review.booking.serviceName,
        author: authorName(review.customer.name),
        createdAt: review.createdAt,
      })),
    };
  }

  /** Emails owners and managers about a low rating, once. Safe to repeat for the same event. */
  public async handleReviewEvent(message: OutboxMessage, now: Date = new Date()): Promise<void> {
    const { reviewId } = message.payload;

    if (message.type !== REVIEW_CONSTANTS.SUBMITTED_EVENT || !message.businessId || typeof reviewId !== "string") return;

    const review = await reviewDal.findById(message.businessId, reviewId);

    if (!review || review.rating > REVIEW_CONSTANTS.LOW_RATING) return;
    if (!(await reviewDal.claimAlert(review.businessId, review.id, now))) return;

    try {
      const recipients = await reviewDal.listAlertRecipients(review.businessId);

      for (const to of recipients) {
        await this.email.send({ to, ...this.lowRatingEmail(review) });
      }
    } catch (error) {
      // Let the retry send it; a retry may repeat it for owners who already got it.
      await reviewDal.releaseAlert(review.businessId, review.id);
      logger.warn({ err: error, reviewId: review.id }, "Low rating alert failed");
      throw error;
    }
  }

  private lowRatingEmail(review: ReviewRecord): { subject: string; text: string } {
    const visited = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: review.booking.timeZone,
    }).format(review.booking.scheduledAt);
    const stars = `${review.rating} star${review.rating === 1 ? "" : "s"}`;
    const staff = review.staff ? ` with ${review.staff.displayName}` : "";
    const comment = review.comment ? `\n\n"${review.comment}"` : "";
    const link = new URL("/business/reviews", env.WEB_ORIGIN).toString();

    return {
      subject: `${stars} for ${review.booking.serviceName} at ${review.business.name}`,
      text: `${review.customer.name} rated their ${review.booking.serviceName}${staff} on ${visited} ${stars}.${comment}\n\nRead it and reply: ${link}`,
    };
  }

  private isReviewable(booking: { status: string; completedAt: Date | null; endsAt: Date }, now: Date): boolean {
    const finishedAt = booking.completedAt ?? booking.endsAt;

    return booking.status === "COMPLETED" && now.getTime() - finishedAt.getTime() <= REVIEW_CONSTANTS.WINDOW_DAYS * DAY;
  }

  private async getOwnedBooking(userId: string, bookingId: string) {
    assertUuid("appointmentId", bookingId);

    const booking = await bookingDal.findForUser(userId, bookingId);

    if (!booking) throw new AppError(404, ERROR_CODES.APPOINTMENT_NOT_FOUND, ERROR_MESSAGES.APPOINTMENT_NOT_FOUND);

    return booking;
  }

  private throwAlreadyReviewed(): never {
    throw new AppError(409, ERROR_CODES.REVIEW_ALREADY_EXISTS, ERROR_MESSAGES.REVIEW_ALREADY_EXISTS);
  }

  private toResponse(review: ReviewRecord): ReviewResponse {
    return {
      id: review.id,
      bookingId: review.bookingId,
      rating: review.rating,
      comment: review.comment,
      status: review.status,
      reply: review.reply,
      repliedAt: review.repliedAt,
      serviceName: review.booking.serviceName,
      staff: review.staff ? { id: review.staff.id, name: review.staff.displayName } : null,
      visitedAt: review.booking.scheduledAt,
      createdAt: review.createdAt,
    };
  }

  private toBusinessResponse(review: ReviewRecord): BusinessReviewResponse {
    return { ...this.toResponse(review), customer: review.customer };
  }
}

export const reviewService = new ReviewService();
