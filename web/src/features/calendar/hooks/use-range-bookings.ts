"use client";

import { useQuery } from "@tanstack/react-query";

import { BOOKING_UI_CONSTANTS } from "@/features/bookings/constants/booking-status.constants";
import { getListBookingsQueryKey, listBookings } from "@/generated/api/bookings/bookings";
import type { BookingResponse } from "@/generated/api/models";
import { addDaysToDate, zonedDateTimeToIso } from "@/lib/utils/date-time";

/** A busy week has more bookings than one page; stop after this many. */
const MAX_PAGES = 10;

/**
 * Every booking starting in `days` local dates from `fromDate`, following
 * the list's cursor. The key starts with the bookings list's, so live
 * booking events refresh it too.
 */
export function useRangeBookings(businessId: string, fromDate: string, days: number, timeZone: string) {
  const from = zonedDateTimeToIso(fromDate, "00:00", timeZone);
  const to = zonedDateTimeToIso(addDaysToDate(fromDate, days), "00:00", timeZone);
  const params = { ...(from ? { from } : {}), ...(to ? { to } : {}), limit: BOOKING_UI_CONSTANTS.PAGE_SIZE };

  return useQuery({
    queryKey: [...getListBookingsQueryKey(businessId, params), "all-pages"],
    enabled: Boolean(from && to),
    queryFn: async ({ signal }) => {
      const items: BookingResponse[] = [];
      let cursor: string | undefined;

      for (let page = 0; page < MAX_PAGES; page += 1) {
        const response = await listBookings(businessId, { ...params, ...(cursor ? { cursor } : {}) }, { signal });

        items.push(...response.items);
        cursor = response.nextCursor;
        if (!cursor) break;
      }

      return items;
    },
  });
}
