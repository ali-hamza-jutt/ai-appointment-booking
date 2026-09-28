"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { TextAreaField } from "@/components/ui/form-controls";
import { StarInput, StarRating } from "@/features/reviews/components/star-rating";
import type { AppointmentResponse, ReviewResponse } from "@/generated/api/models";
import { getGetMyReviewQueryKey, useGetMyReview, useSubmitReview } from "@/generated/api/reviews/reviews";
import { getApiErrorMessage } from "@/lib/api/api-error";

const MAX_COMMENT_LENGTH = 2_000;

/** Lets the customer rate a finished visit, or shows the rating they gave. */
export function AppointmentReview({ appointment }: { appointment: AppointmentResponse }) {
  const isCompleted = appointment.status === "COMPLETED";
  const reviewQuery = useGetMyReview(appointment.id, { query: { enabled: isCompleted, retry: false } });

  if (!isCompleted || !reviewQuery.data) return null;

  const { canReview, review } = reviewQuery.data;

  if (review) return <SubmittedReview review={review} />;
  if (!canReview) return null;

  return <ReviewForm appointmentId={appointment.id} />;
}

function ReviewForm({ appointmentId }: { appointmentId: string }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const submitMutation = useSubmitReview({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMyReviewQueryKey(appointmentId) }),
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rating === 0) return;

    const trimmed = comment.trim();

    submitMutation.mutate({ appointmentId, data: { rating, ...(trimmed ? { comment: trimmed } : {}) } });
  }

  return (
    <form className="space-y-4 border-b border-border p-5 sm:p-6" onSubmit={handleSubmit}>
      <div>
        <h3 className="text-base font-semibold text-ink">How was your visit?</h3>
        <p className="mt-1 text-sm text-muted">Your rating helps the business, and others choosing where to book.</p>
      </div>
      <StarInput onChange={setRating} value={rating} />
      <TextAreaField
        id="review-comment"
        label="Anything to add? (optional)"
        maxLength={MAX_COMMENT_LENGTH}
        onChange={(event) => setComment(event.target.value)}
        value={comment}
      />
      {submitMutation.error ? (
        <Alert tone="danger">{getApiErrorMessage(submitMutation.error, "Your review could not be saved. Please try again.")}</Alert>
      ) : null}
      <Button disabled={rating === 0} isLoading={submitMutation.isPending} type="submit">
        Send review
      </Button>
    </form>
  );
}

function SubmittedReview({ review }: { review: ReviewResponse }) {
  return (
    <section className="space-y-3 border-b border-border p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-base font-semibold text-ink">Your review</h3>
        <StarRating rating={review.rating} />
        {review.status === "PUBLISHED" ? (
          <Badge tone="success">Published</Badge>
        ) : review.status === "PENDING" ? (
          <Badge tone="neutral">Thanks! The business reviews it before it appears</Badge>
        ) : null}
      </div>
      {review.comment ? <p className="whitespace-pre-wrap text-sm leading-6 text-ink-soft">{review.comment}</p> : null}
      {review.reply ? (
        <div className="rounded-[10px] bg-surface-subtle px-4 py-3">
          <p className="text-xs font-semibold text-muted">Reply from the business</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink-soft">{review.reply}</p>
        </div>
      ) : null}
    </section>
  );
}
