import type { Metadata } from "next";

import { AdminBusinessesView } from "@/features/admin/components/admin-businesses-view";

export const metadata: Metadata = { title: "Admin: businesses" };

export default function AdminBusinessesPage() {
  return <AdminBusinessesView />;
}
