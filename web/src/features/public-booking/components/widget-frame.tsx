"use client";

import { CloseIcon } from "@/components/ui/icons";
import { PublicBookingPanel } from "@/features/public-booking/components/public-booking-panel";

/**
 * Tells the page hosting the widget to close it. Only this one event (and
 * nothing about the visitor) crosses to the host page.
 */
function requestClose(): void {
  if (window.parent !== window) window.parent.postMessage({ type: "bookwise:close" }, "*");
}

export function WidgetFrame({
  allowGuestBooking,
  businessName,
  slug,
}: {
  allowGuestBooking: boolean;
  businessName: string;
  slug: string;
}) {
  return (
    <div className="flex h-dvh flex-col bg-surface">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <p className="truncate text-sm font-semibold text-ink">Book with {businessName}</p>
        <button
          aria-label="Close"
          className="flex size-9 items-center justify-center rounded-[9px] text-muted hover:bg-surface-subtle hover:text-ink"
          onClick={requestClose}
          type="button"
        >
          <CloseIcon className="size-5" />
        </button>
      </header>
      <div className="bw-scrollbar min-h-0 flex-1 overflow-y-auto pt-3">
        <PublicBookingPanel allowGuestBooking={allowGuestBooking} embedded slug={slug} />
      </div>
      <p className="shrink-0 border-t border-border py-1.5 text-center text-[10px] text-subtle">Powered by BookWise</p>
    </div>
  );
}
