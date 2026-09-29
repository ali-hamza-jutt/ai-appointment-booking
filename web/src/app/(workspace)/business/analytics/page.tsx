import type { Metadata } from "next";
import { Suspense } from "react";

import { AnalyticsView } from "@/features/analytics/components/analytics-view";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  // The view keeps its filters in the query string.
  return (
    <Suspense fallback={null}>
      <AnalyticsView />
    </Suspense>
  );
}
