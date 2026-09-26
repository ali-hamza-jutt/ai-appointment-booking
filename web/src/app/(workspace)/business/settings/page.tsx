import type { Metadata } from "next";

import { BusinessSettingsView } from "@/features/business-settings/components/business-settings-view";

export const metadata: Metadata = { title: "Business settings" };

export default function BusinessSettingsPage() {
  return <BusinessSettingsView />;
}
