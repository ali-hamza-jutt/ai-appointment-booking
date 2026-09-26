"use client";

import { useQueryClient } from "@tanstack/react-query";

import type { BookingAction } from "@/features/bookings/utils/booking-format";
import { getGetPublicAvailabilityQueryKey } from "@/generated/api/public-booking/public-booking";
import {
  getListBookingsQueryKey,
  useApproveBooking,
  useCancelBooking,
  useCheckInBooking,
  useCompleteBooking,
  useDeclineBooking,
  useMarkBookingNoShow,
} from "@/generated/api/bookings/bookings";

/** Runs a staff action on a booking and refreshes lists and availability. */
export function useBookingActions(businessId: string, businessSlug: string) {
  const queryClient = useQueryClient();
  const approve = useApproveBooking();
  const decline = useDeclineBooking();
  const checkIn = useCheckInBooking();
  const complete = useCompleteBooking();
  const noShow = useMarkBookingNoShow();
  const cancel = useCancelBooking();
  const mutations = { APPROVE: approve, DECLINE: decline, CHECK_IN: checkIn, COMPLETE: complete, NO_SHOW: noShow };

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey(businessId) });
    void queryClient.invalidateQueries({
      queryKey: getGetPublicAvailabilityQueryKey(businessSlug),
    });
  }

  return {
    error:
      approve.error ?? decline.error ?? checkIn.error ?? complete.error ?? noShow.error ?? cancel.error,
    isPending: Object.values(mutations).some((mutation) => mutation.isPending) || cancel.isPending,
    refresh,
    run(action: BookingAction, bookingId: string) {
      mutations[action].mutate({ businessId, bookingId }, { onSuccess: refresh });
    },
    cancel(bookingId: string, reason: string, onDone?: () => void) {
      cancel.mutate(
        { businessId, bookingId, data: reason.trim() ? { reason: reason.trim() } : {} },
        {
          onSuccess: () => {
            refresh();
            onDone?.();
          },
        },
      );
    },
  };
}
