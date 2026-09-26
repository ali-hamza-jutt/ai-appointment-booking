import type { Metadata } from "next";

import { ServicesView } from "@/features/catalog/components/services-view";

export const metadata: Metadata = { title: "Services" };

export default function ServicesPage() {
  return <ServicesView />;
}
