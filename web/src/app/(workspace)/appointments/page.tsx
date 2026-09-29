import type { Metadata } from "next";
import { Suspense } from "react";

import { AppointmentsList } from "@/features/appointments/components/appointments-list";

export const metadata: Metadata = { title: "My appointments" };

export default function AppointmentsPage() {
  // The view keeps its filters in the query string.
  return (
    <Suspense fallback={null}>
      <AppointmentsList />
    </Suspense>
  );
}
