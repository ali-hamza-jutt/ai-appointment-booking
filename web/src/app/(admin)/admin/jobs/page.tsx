import type { Metadata } from "next";

import { AdminJobsView } from "@/features/admin/components/admin-jobs-view";

export const metadata: Metadata = { title: "Admin: failed jobs" };

export default function AdminJobsPage() {
  return <AdminJobsView />;
}
