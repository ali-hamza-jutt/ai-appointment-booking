import type { Metadata } from "next";
import { Suspense } from "react";

import { CustomersView } from "@/features/customers/components/customers-view";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  // The view keeps its filters in the query string.
  return (
    <Suspense fallback={null}>
      <CustomersView />
    </Suspense>
  );
}
