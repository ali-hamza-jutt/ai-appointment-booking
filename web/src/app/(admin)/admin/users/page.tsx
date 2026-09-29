import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminUsersView } from "@/features/admin/components/admin-users-view";

export const metadata: Metadata = { title: "Admin: people" };

export default function AdminUsersPage() {
  // The view keeps its filters in the query string.
  return (
    <Suspense fallback={null}>
      <AdminUsersView />
    </Suspense>
  );
}
