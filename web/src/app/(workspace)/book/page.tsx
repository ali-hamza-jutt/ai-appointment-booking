import type { Metadata } from "next";

import { BookingWorkspace } from "@/features/booking/components/booking-workspace";

export const metadata: Metadata = { title: "Book an appointment" };

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { new: bookingKey = "default" } = await searchParams;

  return <BookingWorkspace key={bookingKey} />;
}
