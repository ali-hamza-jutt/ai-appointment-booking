"use client";

import { useSearchParams } from "next/navigation";

import { Alert } from "@/components/ui/feedback";
import { CALENDAR_UI_CONSTANTS } from "@/features/calendar-sync/constants/calendar-ui.constants";

/** The outcome of connecting a calendar, shown when the provider sends the browser back. */
export function CalendarReturnNotice() {
  const searchParams = useSearchParams();
  const result = searchParams.get("calendar");

  if (result === "connected") {
    return (
      <Alert className="mb-5" tone="success">
        Calendar connected. Busy times will start blocking bookings in a minute or two.
      </Alert>
    );
  }

  if (result === "error") {
    const reason = searchParams.get("reason") ?? "failed";

    return (
      <Alert className="mb-5" tone="danger">
        {CALENDAR_UI_CONSTANTS.RETURN_ERRORS[reason] ?? CALENDAR_UI_CONSTANTS.RETURN_ERRORS.failed}
      </Alert>
    );
  }

  return null;
}
