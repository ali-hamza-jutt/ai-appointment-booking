import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppointmentDetail } from "@/features/appointments/components/appointment-detail";
import { findAppointmentPreview } from "@/features/appointments/data/appointment-preview-data";

export const metadata: Metadata = { title: "Appointment details" };

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { appointmentId } = await params;
  const appointment = findAppointmentPreview(appointmentId);

  if (!appointment) notFound();

  return <AppointmentDetail appointment={appointment} />;
}
