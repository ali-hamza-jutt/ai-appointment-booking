import type { Metadata } from "next";

import { AdminAuditView } from "@/features/admin/components/admin-audit-view";

export const metadata: Metadata = { title: "Admin: audit log" };

export default function AdminAuditPage() {
  return <AdminAuditView />;
}
