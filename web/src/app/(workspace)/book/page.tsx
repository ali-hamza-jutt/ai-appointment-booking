import type { Metadata } from "next";

import { BookingEntry } from "@/features/booking/components/booking-entry";

export const metadata: Metadata = { title: "Book an appointment" };

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string; new?: string; sessionId?: string }>;
}) {
  const { business, new: newBookingKey, sessionId } = await searchParams;

  return (
    <BookingEntry
      businessSlug={business}
      initialSessionId={sessionId}
      newBookingKey={newBookingKey}
      shouldStartNew={newBookingKey !== undefined}
    />
  );
}
