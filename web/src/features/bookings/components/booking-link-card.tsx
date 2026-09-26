"use client";

import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { GlobeIcon } from "@/components/ui/icons";

const subscribe = () => () => undefined;

/** Shows the link customers use to book with this business. */
export function BookingLinkCard({ slug }: { slug: string }) {
  const origin = useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => "",
  );
  const [copied, setCopied] = useState(false);
  const link = `${origin}/book?business=${encodeURIComponent(slug)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-card">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand">
        <GlobeIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-muted">Your booking link</p>
        <p className="truncate text-sm font-medium text-ink">{link}</p>
      </div>
      <Button onClick={() => void copyLink()} size="sm" variant="secondary">
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}
