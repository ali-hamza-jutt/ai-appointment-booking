import { randomUUID } from "node:crypto";

import { REVIEW_CONSTANTS } from "../../../constants/app.constants.js";
import { prisma } from "../../../infrastructure/database/prisma.js";
import type {
  CreateReviewData,
  ReviewPatch,
  ReviewRecord,
  ReviewStatus,
  ReviewSummary,
} from "../dto/review.dto.js";

const reviewSelect = {
  id: true,
  businessId: true,
  bookingId: true,
  rating: true,
  comment: true,
  status: true,
  reply: true,
  repliedAt: true,
  createdAt: true,
  booking: { select: { serviceName: true, scheduledAt: true, timeZone: true } },
  staff: { select: { id: true, displayName: true } },
  customer: { select: { id: true, name: true } },
  business: { select: { id: true, name: true } },
} as const;

function toSummary(aggregate: { _avg: { rating: number | null }; _count: { _all: number } }): ReviewSummary {
  const average = aggregate._avg.rating;

  return {
    average: average === null ? null : Math.round(average * 10) / 10,
    count: aggregate._count._all,
  };
}

export class ReviewDal {
  /** Saves the review and, in the same transaction, the event that alerts owners to low ratings. */
  public create(data: CreateReviewData): Promise<ReviewRecord> {
    return prisma.$transaction(async (transaction) => {
      const review = await transaction.review.create({ data, select: reviewSelect });

      await transaction.outboxEvent.create({
        data: {
          id: randomUUID(),
          businessId: data.businessId,
          type: REVIEW_CONSTANTS.SUBMITTED_EVENT,
          aggregateType: REVIEW_CONSTANTS.AGGREGATE_TYPE,
          aggregateId: review.id,
          payload: { reviewId: review.id, businessId: data.businessId, bookingId: data.bookingId, rating: data.rating },
        },
      });

      return review;
    });
  }

  public findForBooking(businessId: string, bookingId: string): Promise<ReviewRecord | null> {
    return prisma.review.findFirst({ where: { businessId, bookingId }, select: reviewSelect });
  }

  public async existsForBooking(businessId: string, bookingId: string): Promise<boolean> {
    return (await prisma.review.count({ where: { businessId, bookingId } })) > 0;
  }

  public findById(businessId: string, reviewId: string): Promise<ReviewRecord | null> {
    return prisma.review.findFirst({ where: { businessId, id: reviewId }, select: reviewSelect });
  }

  public listForBusiness(businessId: string, status: ReviewStatus | undefined, limit: number): Promise<ReviewRecord[]> {
    return prisma.review.findMany({
      where: { businessId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: reviewSelect,
    });
  }

  public listPublished(businessId: string, limit: number): Promise<ReviewRecord[]> {
    return prisma.review.findMany({
      where: { businessId, status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: reviewSelect,
    });
  }

  public async summarize(businessId: string, status?: ReviewStatus): Promise<ReviewSummary> {
    return toSummary(
      await prisma.review.aggregate({
        where: { businessId, ...(status ? { status } : {}) },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    );
  }

  public countPending(businessId: string): Promise<number> {
    return prisma.review.count({ where: { businessId, status: "PENDING" } });
  }

  public async update(businessId: string, reviewId: string, patch: ReviewPatch): Promise<ReviewRecord> {
    await prisma.review.updateMany({ where: { businessId, id: reviewId }, data: patch });

    return prisma.review.findFirstOrThrow({ where: { businessId, id: reviewId }, select: reviewSelect });
  }

  /** Marks the owners as told about a review; false when someone already did. */
  public async claimAlert(businessId: string, reviewId: string, now: Date): Promise<boolean> {
    const claimed = await prisma.review.updateMany({
      where: { businessId, id: reviewId, alertedAt: null },
      data: { alertedAt: now },
    });

    return claimed.count === 1;
  }

  public async releaseAlert(businessId: string, reviewId: string): Promise<void> {
    await prisma.review.updateMany({ where: { businessId, id: reviewId }, data: { alertedAt: null } });
  }

  /** Where owners and managers read their email. */
  public async listAlertRecipients(businessId: string): Promise<string[]> {
    const members = await prisma.membership.findMany({
      where: { businessId, role: { in: ["OWNER", "MANAGER"] } },
      orderBy: { createdAt: "asc" },
      select: { user: { select: { email: true } } },
    });

    return [...new Set(members.map((member) => member.user.email).filter((email): email is string => Boolean(email)))];
  }
}

export const reviewDal = new ReviewDal();
