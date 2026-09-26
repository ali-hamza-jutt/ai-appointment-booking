"use client";

import { BOOKING_UI_CONSTANTS } from "@/features/bookings/constants/booking-status.constants";
import { useListBookings } from "@/generated/api/bookings/bookings";
import type { BookingStatus } from "@/generated/api/models";
import { addDaysToDate, zonedDateTimeToIso } from "@/lib/utils/date-time";

/** Bookings starting on one local date in the business time zone. */
export function useDayBookings(
  businessId: string,
  date: string,
  timeZone: string,
  status: BookingStatus | "ALL",
) {
  const from = zonedDateTimeToIso(date, "00:00", timeZone);
  const to = zonedDateTimeToIso(addDaysToDate(date, 1), "00:00", timeZone);

  return useListBookings(
    businessId,
    {
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(status !== "ALL" ? { status } : {}),
      limit: BOOKING_UI_CONSTANTS.PAGE_SIZE,
    },
    { query: { enabled: Boolean(from && to) } },
  );
}
