import type { Metadata } from "next";

import { BusinessReviewsView } from "@/features/reviews/components/business-reviews-view";

export const metadata: Metadata = { title: "Reviews" };

export default function ReviewsPage() {
  return <BusinessReviewsView />;
}
