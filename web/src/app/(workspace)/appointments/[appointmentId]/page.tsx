import type { Metadata } from "next";

import { AppointmentDetail } from "@/features/appointments/components/appointment-detail";

export const metadata: Metadata = { title: "Appointment details" };

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { appointmentId } = await params;

  return <AppointmentDetail appointmentId={appointmentId} />;
}
