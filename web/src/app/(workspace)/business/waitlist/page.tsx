import type { Metadata } from "next";

import { BusinessWaitlistView } from "@/features/waitlist/components/business-waitlist-view";

export const metadata: Metadata = { title: "Waitlist" };

export default function WaitlistPage() {
  return <BusinessWaitlistView />;
}
