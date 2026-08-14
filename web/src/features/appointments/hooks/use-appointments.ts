"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { APPOINTMENT_UI_CONSTANTS } from "@/features/appointments/constants/appointment-ui.constants";
import type { AppointmentFilter } from "@/features/appointments/types/appointment-ui";
import {
  getListAppointmentsQueryKey,
  listAppointments,
} from "@/generated/api/appointments/appointments";
import type {
  AppointmentListResponse,
  ListAppointmentsParams,
} from "@/generated/api/models";

export function useAppointments(filter: AppointmentFilter) {
  const baseParams: ListAppointmentsParams = {
    limit: APPOINTMENT_UI_CONSTANTS.PAGE_SIZE,
    ...(filter !== "ALL" ? { status: filter } : {}),
  };

  return useInfiniteQuery({
    getNextPageParam: (lastPage: AppointmentListResponse) =>
      lastPage.nextCursor ?? null,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }): Promise<AppointmentListResponse> =>
      listAppointments(
        {
          ...baseParams,
          ...(pageParam ? { cursor: pageParam } : {}),
        },
        { signal },
      ),
    queryKey: [
      ...getListAppointmentsQueryKey(baseParams),
      "infinite",
    ] as const,
  });
}
