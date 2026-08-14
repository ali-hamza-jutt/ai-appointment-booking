import type { Metadata } from "next";

import { BookingEntry } from "@/features/booking/components/booking-entry";

export const metadata: Metadata = { title: "Book an appointment" };

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; sessionId?: string }>;
}) {
  const { new: newBookingKey, sessionId } = await searchParams;

  return (
    <BookingEntry
      initialSessionId={sessionId}
      newBookingKey={newBookingKey}
      shouldStartNew={newBookingKey !== undefined}
    />
  );
}
