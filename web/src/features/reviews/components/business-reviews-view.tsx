"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { TextAreaField } from "@/components/ui/form-controls";
import { StarIcon } from "@/components/ui/icons";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { BusinessRequired } from "@/features/business-settings/components/business-required";
import { StarRating } from "@/features/reviews/components/star-rating";
import type { BusinessReviewResponse, BusinessSummaryResponse, ReviewStatus } from "@/generated/api/models";
import {
  getListBusinessReviewsQueryKey,
  useListBusinessReviews,
  useModerateReview,
} from "@/generated/api/reviews/reviews";
import { useSearchParamState } from "@/hooks/use-search-param-state";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { formatDate } from "@/lib/utils/date-time";

type Filter = ReviewStatus | "ALL";

const FILTERS: ReadonlyArray<{ label: string; value: Filter }> = [
  { label: "To publish", value: "PENDING" },
  { label: "Published", value: "PUBLISHED" },
  { label: "Hidden", value: "HIDDEN" },
  { label: "All", value: "ALL" },
];

const FILTER_VALUES = FILTERS.map((option) => option.value);

const STATUS_PRESENTATION: Record<ReviewStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Not published", tone: "warning" },
  PUBLISHED: { label: "Published", tone: "success" },
  HIDDEN: { label: "Hidden", tone: "neutral" },
};

export function BusinessReviewsView() {
  return (
    <BusinessRequired>
      {(business) => <BusinessReviewsContent business={business} />}
    </BusinessRequired>
  );
}

function BusinessReviewsContent({ business }: { business: BusinessSummaryResponse }) {
  const [filter, setFilter] = useSearchParamState<Filter>("status", "PENDING", FILTER_VALUES);
  const reviewsQuery = useListBusinessReviews(business.id, filter === "ALL" ? undefined : { status: filter });
  const reviews = reviewsQuery.data?.items ?? [];
  const summary = reviewsQuery.data?.summary;

  return (
    <PageContainer>
      <PageHeader
        description="Customers are asked to rate their visit two hours after it ends. Reviews appear on your booking page once you publish them, and you hear straight away about ratings of 2 stars or less."
        title="Reviews"
      />

      {summary ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <SummaryTile label="Average rating" value={summary.average === null ? "No ratings yet" : `${summary.average.toFixed(1)} / 5`} />
          <SummaryTile label="Reviews" value={String(summary.count)} />
          <SummaryTile label="Waiting to be published" value={String(summary.pending)} />
        </div>
      ) : null}

      <Tabs
        ariaLabel="Filter reviews"
        controls="review-results"
        onChange={setFilter}
        options={FILTERS}
        value={filter}
      />

      <section id="review-results" role="tabpanel">
        {reviewsQuery.isPending ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : reviewsQuery.isError ? (
          <Alert tone="danger">{getApiErrorMessage(reviewsQuery.error, "Reviews could not be loaded.")}</Alert>
        ) : reviews.length === 0 ? (
          <EmptyState
            description={filter === "PENDING" ? "New reviews show up here for you to publish or hide." : "Nothing here yet."}
            icon={StarIcon}
            title="No reviews"
          />
        ) : (
          <ul className="space-y-4">
            {reviews.map((review) => (
              <ReviewCard businessId={business.id} key={review.id} review={review} />
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-4 shadow-card">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1 text-lg font-bold text-ink">{value}</p>
    </div>
  );
}

function ReviewCard({ businessId, review }: { businessId: string; review: BusinessReviewResponse }) {
  const queryClient = useQueryClient();
  const [reply, setReply] = useState(review.reply ?? "");
  const [isReplying, setIsReplying] = useState(false);
  const moderateMutation = useModerateReview({
    mutation: {
      onSuccess: () => {
        setIsReplying(false);
        return queryClient.invalidateQueries({ queryKey: getListBusinessReviewsQueryKey(businessId) });
      },
    },
  });
  const status = STATUS_PRESENTATION[review.status];
  const setStatus = (next: "PUBLISHED" | "HIDDEN") =>
    moderateMutation.mutate({ businessId, reviewId: review.id, data: { status: next } });

  return (
    <li className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StarRating rating={review.rating} />
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="mt-2 text-sm font-semibold text-ink">{review.customer.name}</p>
          <p className="text-xs text-muted">
            {review.serviceName}
            {review.staff ? ` with ${review.staff.name}` : ""} · visited {formatDate(review.visitedAt)}
          </p>
        </div>
        <div className="flex gap-2">
          {review.status !== "PUBLISHED" ? (
            <Button isLoading={moderateMutation.isPending} onClick={() => setStatus("PUBLISHED")} size="sm">
              Publish
            </Button>
          ) : null}
          {review.status !== "HIDDEN" ? (
            <Button
              isLoading={moderateMutation.isPending}
              onClick={() => setStatus("HIDDEN")}
              size="sm"
              variant="secondary"
            >
              Hide
            </Button>
          ) : null}
        </div>
      </div>

      {review.comment ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-soft">{review.comment}</p>
      ) : (
        <p className="mt-3 text-sm text-subtle">No comment.</p>
      )}

      {isReplying ? (
        <div className="mt-4 space-y-3">
          <TextAreaField
            hint="Shown under the review once it is published. Leave empty to remove it."
            id={`reply-${review.id}`}
            label="Your reply"
            maxLength={2_000}
            onChange={(event) => setReply(event.target.value)}
            value={reply}
          />
          <div className="flex gap-2">
            <Button
              isLoading={moderateMutation.isPending}
              onClick={() => moderateMutation.mutate({ businessId, reviewId: review.id, data: { reply } })}
              size="sm"
            >
              Save reply
            </Button>
            <Button onClick={() => setIsReplying(false)} size="sm" variant="ghost">
              Cancel
            </Button>
          </div>
        </div>
      ) : review.reply ? (
        <div className="mt-4 rounded-[10px] bg-surface-subtle px-4 py-3">
          <p className="text-xs font-semibold text-muted">Your reply</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink-soft">{review.reply}</p>
          <Button className="mt-2" onClick={() => setIsReplying(true)} size="sm" variant="ghost">
            Edit reply
          </Button>
        </div>
      ) : (
        <Button className="mt-3" onClick={() => setIsReplying(true)} size="sm" variant="ghost">
          Reply
        </Button>
      )}

      {moderateMutation.error ? (
        <Alert className="mt-3" tone="danger">
          {getApiErrorMessage(moderateMutation.error, "The review could not be updated.")}
        </Alert>
      ) : null}
    </li>
  );
}
