import type { Metadata } from "next";

import { PaymentSettingsView } from "@/features/payments/components/payment-settings-view";

export const metadata: Metadata = { title: "Payments" };

export default function PaymentsPage() {
  return <PaymentSettingsView />;
}
