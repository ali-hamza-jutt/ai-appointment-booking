"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import {
  GlobeIcon,
  LogoutIcon,
  PlusIcon,
  UserIcon,
} from "@/components/ui/icons";
import { useAuth } from "@/features/auth/auth-context";
import { getUserInitials } from "@/features/auth/utils/user-display";
import { useBrowserTimeZone } from "@/hooks/use-browser-time-zone";

export function ProfileOverview() {
  const router = useRouter();
  const { signOut, user } = useAuth();
  const timeZone = useBrowserTimeZone();

  if (!user) return null;

  function handleSignOut() {
    signOut();
    router.replace("/login");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight text-ink">
          Profile settings
        </h2>
        <p className="mt-1 text-sm text-muted">
          Review your account and current booking preferences.
        </p>
      </div>

      <Alert className="mb-4" tone="info">
        Account details are read-only because profile updates are not currently
        supported by the BookWise API.
      </Alert>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-5 sm:p-6">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-soft text-base font-bold text-brand">
              {getUserInitials(user.fullName) || "BW"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-ink">
                {user.fullName}
              </p>
              <p className="mt-0.5 truncate text-sm text-muted">{user.email}</p>
            </div>
          </div>
          <Badge tone="success">Authenticated</Badge>
        </header>

        <dl className="grid gap-x-8 gap-y-6 p-5 sm:grid-cols-2 sm:p-6">
          <ProfileDetail
            icon={<UserIcon className="size-[18px]" />}
            label="Full name"
            value={user.fullName}
          />
          <ProfileDetail
            icon={<UserIcon className="size-[18px]" />}
            label="Email address"
            value={user.email}
          />
          <ProfileDetail
            icon={<GlobeIcon className="size-[18px]" />}
            label="Booking timezone"
            value={timeZone}
          />
          <ProfileDetail
            icon={<UserIcon className="size-[18px]" />}
            label="Account reference"
            value={user.id.slice(0, 8).toUpperCase()}
          />
        </dl>

        <div className="border-t border-border bg-surface-subtle px-5 py-4 sm:px-6">
          <p className="text-xs leading-5 text-muted">
            BookWise detects the booking timezone from this browser and sends it
            with each AI booking request. It is not stored as profile data.
          </p>
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink">Account actions</h3>
            <p className="mt-1 text-xs leading-5 text-muted">
              Start another booking or securely end this browser session.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <LinkButton
              href="/book"
              leadingIcon={<PlusIcon className="size-4" />}
              variant="secondary"
            >
              New booking
            </LinkButton>
            <Button
              leadingIcon={<LogoutIcon className="size-4" />}
              onClick={handleSignOut}
              variant="ghost"
            >
              Sign out
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfileDetail({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 gap-3">
      <span className="mt-0.5 shrink-0 text-brand">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-muted">{label}</dt>
        <dd className="mt-1 break-words text-sm font-medium text-ink">{value}</dd>
      </div>
    </div>
  );
}
