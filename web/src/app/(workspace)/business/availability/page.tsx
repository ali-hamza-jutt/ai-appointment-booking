import type { Metadata } from "next";

import { AvailabilityView } from "@/features/availability/components/availability-view";

export const metadata: Metadata = { title: "Availability" };

export default function AvailabilityPage() {
  return <AvailabilityView />;
}
