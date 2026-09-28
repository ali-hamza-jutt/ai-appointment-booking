import type { Metadata } from "next";
import { Suspense } from "react";

import { BillingView } from "@/features/billing/components/billing-view";

export const metadata: Metadata = { title: "Plan and billing" };

export default function BillingPage() {
  // The view reads ?checkout=done after Stripe sends the owner back.
  return (
    <Suspense fallback={null}>
      <BillingView />
    </Suspense>
  );
}
