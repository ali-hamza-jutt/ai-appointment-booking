import type { Metadata } from "next";

import { AdminBusinessDetailView } from "@/features/admin/components/admin-business-detail";

export const metadata: Metadata = { title: "Admin: business" };

export default async function AdminBusinessPage({ params }: PageProps<"/admin/businesses/[businessId]">) {
  const { businessId } = await params;

  return <AdminBusinessDetailView businessId={businessId} />;
}
