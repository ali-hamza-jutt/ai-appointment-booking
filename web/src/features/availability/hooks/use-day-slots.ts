"use client";

import { useGetBusinessAvailability } from "@/generated/api/availability/availability";
import { useGetPublicAvailability } from "@/generated/api/public-booking/public-booking";
import type { AvailableSlot } from "@/generated/api/models";

interface DaySlotsQuery {
  date: string;
  serviceId: string;
  staffId?: string;
  timeZone: string;
}

interface DaySlotsResult {
  error: Error | null;
  isLoading: boolean;
  slots: AvailableSlot[];
}

function toParams({ date, serviceId, staffId, timeZone }: DaySlotsQuery) {
  return {
    serviceId,
    from: date,
    to: date,
    tz: timeZone,
    ...(staffId ? { staffId } : {}),
  };
}

/** Open times customers can book on one local date. */
export function usePublicDaySlots(slug: string, query: DaySlotsQuery): DaySlotsResult {
  const enabled = Boolean(slug && query.serviceId && query.date);
  const availability = useGetPublicAvailability(slug, toParams(query), {
    query: { enabled },
  });

  return {
    error: availability.error,
    isLoading: enabled && availability.isPending,
    slots: availability.data?.days[0]?.slots ?? [],
  };
}

/** Open times staff can book on one local date (no online-only limits). */
export function useBusinessDaySlots(businessId: string, query: DaySlotsQuery): DaySlotsResult {
  const enabled = Boolean(businessId && query.serviceId && query.date);
  const availability = useGetBusinessAvailability(businessId, toParams(query), {
    query: { enabled },
  });

  return {
    error: availability.error,
    isLoading: enabled && availability.isPending,
    slots: availability.data?.days[0]?.slots ?? [],
  };
}
