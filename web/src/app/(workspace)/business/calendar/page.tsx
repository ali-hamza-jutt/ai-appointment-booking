import type { Metadata } from "next";

import { BusinessCalendar } from "@/features/calendar/components/business-calendar";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  return <BusinessCalendar />;
}
