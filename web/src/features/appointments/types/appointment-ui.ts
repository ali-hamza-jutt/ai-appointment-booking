import type { BadgeTone } from "@/components/ui/badge";
import type { AppointmentStatus } from "@/generated/api/models";

export type AppointmentFilter = "ALL" | AppointmentStatus;

export interface AppointmentViewModel {
  createdAtLabel: string;
  date: string;
  dateTimeLabel: string;
  duration: string;
  id: string;
  notes: string;
  reference: string;
  sourceLabel: string;
  status: AppointmentStatus;
  statusLabel: string;
  statusTone: BadgeTone;
  time: string;
  timezone: string;
  title: string;
}
