import type { Metadata } from "next";
import { Suspense } from "react";

import { BusinessReviewsView } from "@/features/reviews/components/business-reviews-view";

export const metadata: Metadata = { title: "Reviews" };

export default function ReviewsPage() {
  // The view keeps its filters in the query string.
  return (
    <Suspense fallback={null}>
      <BusinessReviewsView />
    </Suspense>
  );
}
