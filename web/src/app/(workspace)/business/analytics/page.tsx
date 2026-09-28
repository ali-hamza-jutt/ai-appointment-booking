import type { Metadata } from "next";

import { AnalyticsView } from "@/features/analytics/components/analytics-view";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return <AnalyticsView />;
}
