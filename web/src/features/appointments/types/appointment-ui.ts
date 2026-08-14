import type { BadgeTone } from "@/components/ui/badge";

export type AppointmentStatusView = "upcoming" | "completed" | "cancelled";

export interface AppointmentViewModel {
  bookingReference: string;
  date: string;
  dateTimeLabel: string;
  duration: string;
  id: string;
  notes: string;
  status: AppointmentStatusView;
  statusTone: BadgeTone;
  time: string;
  timezone: string;
  title: string;
}
