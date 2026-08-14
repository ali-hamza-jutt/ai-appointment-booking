import type { AppointmentViewModel } from "@/features/appointments/types/appointment-ui";

export const appointmentPreviews: AppointmentViewModel[] = [
  {
    bookingReference: "BK-081826-3391",
    date: "Tuesday, August 18, 2026",
    dateTimeLabel: "Aug 18 · 10:00 AM",
    duration: "30 minutes",
    id: "project-consultation",
    notes: "Discuss project goals and next steps.",
    status: "upcoming",
    statusTone: "brand",
    time: "10:00 AM",
    timezone: "Asia/Karachi",
    title: "Project consultation",
  },
  {
    bookingReference: "BK-073026-1180",
    date: "Thursday, July 30, 2026",
    dateTimeLabel: "Jul 30 · 3:30 PM",
    duration: "45 minutes",
    id: "planning-session",
    notes: "Quarterly planning and priorities.",
    status: "completed",
    statusTone: "success",
    time: "3:30 PM",
    timezone: "Asia/Karachi",
    title: "Quarterly planning session",
  },
  {
    bookingReference: "BK-072226-0942",
    date: "Wednesday, July 22, 2026",
    dateTimeLabel: "Jul 22 · 11:00 AM",
    duration: "30 minutes",
    id: "follow-up-call",
    notes: "Review open action items.",
    status: "cancelled",
    statusTone: "danger",
    time: "11:00 AM",
    timezone: "Asia/Karachi",
    title: "Follow-up call",
  },
];

export function findAppointmentPreview(id: string) {
  return appointmentPreviews.find((appointment) => appointment.id === id);
}
