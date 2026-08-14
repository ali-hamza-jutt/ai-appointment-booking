import type { Metadata } from "next";

import { BookingWorkspace } from "@/features/booking/components/booking-workspace";

export const metadata: Metadata = { title: "Book an appointment" };

export default function BookPage() {
  return <BookingWorkspace />;
}
