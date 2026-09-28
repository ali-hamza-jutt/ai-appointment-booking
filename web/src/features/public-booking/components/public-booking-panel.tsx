"use client";

import { useState } from "react";

import { Skeleton } from "@/components/ui/feedback";
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-context";
import { BookingWorkspace } from "@/features/booking/components/booking-workspace";
import { BookingSteps } from "@/features/public-booking/components/booking-steps";
import { GuestSignIn } from "@/features/public-booking/components/guest-sign-in";

type PanelTab = "form" | "chat";

const TABS = [
  { label: "Book online", value: "form" },
  { label: "Chat with us", value: "chat" },
] as const;

interface PublicBookingPanelProps {
  slug: string;
  allowGuestBooking: boolean;
  embedded?: boolean;
}

/** The public page's and widget's booking area: a step-by-step form, or the assistant. */
export function PublicBookingPanel({ allowGuestBooking, embedded = false, slug }: PublicBookingPanelProps) {
  const [tab, setTab] = useState<PanelTab>("form");

  return (
    <div>
      <Tabs
        ariaLabel="How to book"
        className="px-4 sm:px-5"
        controls="public-booking-tab"
        onChange={setTab}
        options={TABS}
        value={tab}
      />
      <div id="public-booking-tab" role="tabpanel">
        {tab === "form" ? (
          <div className="px-4 pb-5 sm:px-5">
            <BookingSteps allowGuestBooking={allowGuestBooking} embedded={embedded} slug={slug} />
          </div>
        ) : (
          <PublicChat allowGuestBooking={allowGuestBooking} embedded={embedded} slug={slug} />
        )}
      </div>
    </div>
  );
}

function PublicChat({ allowGuestBooking, embedded, slug }: Required<PublicBookingPanelProps>) {
  const { status } = useAuth();
  // Bumping the key starts a fresh chat in place.
  const [chatKey, setChatKey] = useState(0);

  if (status === "loading") return <Skeleton className="mx-5 h-64 rounded-xl" />;

  if (status !== "authenticated") {
    return (
      <div className="px-4 pb-5 sm:px-5">
        <GuestSignIn allowGuestBooking={allowGuestBooking} embedded={embedded} purpose="to chat with our assistant" slug={slug} />
      </div>
    );
  }

  return (
    <BookingWorkspace businessSlug={slug} embedded key={chatKey} onStartNew={() => setChatKey((key) => key + 1)} />
  );
}
