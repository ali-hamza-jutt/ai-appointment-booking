import type { Metadata } from "next";

import { BusinessSetupForm } from "@/features/business-settings/components/business-setup-form";

export const metadata: Metadata = { title: "Set up your business" };

export default function BusinessSetupPage() {
  return <BusinessSetupForm />;
}
