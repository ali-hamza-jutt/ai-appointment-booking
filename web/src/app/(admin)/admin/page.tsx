import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminBusinessesView } from "@/features/admin/components/admin-businesses-view";

export const metadata: Metadata = { title: "Admin: businesses" };

export default function AdminBusinessesPage() {
  // The view keeps its filters in the query string.
  return (
    <Suspense fallback={null}>
      <AdminBusinessesView />
    </Suspense>
  );
}
