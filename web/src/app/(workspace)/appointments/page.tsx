import type { Metadata } from "next";

import { AppointmentsList } from "@/features/appointments/components/appointments-list";

export const metadata: Metadata = { title: "My appointments" };

export default function AppointmentsPage() {
  return <AppointmentsList />;
}
