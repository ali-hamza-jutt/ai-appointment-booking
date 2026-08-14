"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { BookWiseLogo } from "@/components/brand/bookwise-logo";
import { LinkButton } from "@/components/ui/button";
import {
  CalendarIcon,
  ChatIcon,
  CloseIcon,
  ConversationsIcon,
  LogoutIcon,
  MenuIcon,
  PlusIcon,
  UserIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";

interface AppShellProps {
  children: ReactNode;
}

const navigation = [
  { href: "/book", icon: ChatIcon, label: "Book an appointment" },
  { href: "/appointments", icon: CalendarIcon, label: "My appointments" },
  { href: "/conversations", icon: ConversationsIcon, label: "Conversations" },
  { href: "/profile", icon: UserIcon, label: "Profile" },
];

function getPageTitle(pathname: string) {
  if (pathname.startsWith("/appointments/")) return "Appointment details";
  if (pathname.startsWith("/appointments")) return "My appointments";
  if (pathname.startsWith("/conversations/")) return "Conversation";
  if (pathname.startsWith("/conversations")) return "Conversations";
  if (pathname.startsWith("/profile")) return "Profile";
  return "Book an appointment";
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-border px-5">
        <BookWiseLogo />
      </div>

      <div className="px-4 pb-4 pt-5">
        <LinkButton
          fullWidth
          href="/book"
          leadingIcon={<PlusIcon className="size-4" />}
          onClick={onNavigate}
        >
          New booking
        </LinkButton>
      </div>

      <nav aria-label="Primary navigation" className="flex-1 space-y-1 px-3">
        {navigation.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-[9px] px-3 text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-soft text-brand"
                  : "text-muted hover:bg-surface-subtle hover:text-ink",
              )}
              href={href}
              key={href}
              onClick={onNavigate}
            >
              <Icon className="size-[18px]" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <div className="mb-1 flex items-center gap-3 rounded-[9px] px-3 py-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand">
            JR
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">Jordan Rivera</span>
            <span className="block truncate text-xs text-muted">jordan@example.com</span>
          </span>
        </div>
        <Link
          className="flex min-h-10 items-center gap-3 rounded-[9px] px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-subtle hover:text-ink"
          href="/login"
          onClick={onNavigate}
        >
          <LogoutIcon className="size-[18px]" />
          Sign out
        </Link>
      </div>
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-border bg-surface lg:block">
        <SidebarContent />
      </aside>

      {isMenuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-overlay"
            onClick={() => setIsMenuOpen(false)}
            type="button"
          />
          <aside className="relative h-full w-[min(82vw,300px)] bg-surface shadow-modal">
            <button
              aria-label="Close navigation"
              className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-[9px] text-muted hover:bg-surface-subtle hover:text-ink"
              onClick={() => setIsMenuOpen(false)}
              type="button"
            >
              <CloseIcon className="size-5" />
            </button>
            <SidebarContent onNavigate={() => setIsMenuOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur sm:px-6">
          <button
            aria-expanded={isMenuOpen}
            aria-label="Open navigation"
            className="flex size-9 items-center justify-center rounded-[9px] text-muted hover:bg-surface-subtle hover:text-ink lg:hidden"
            onClick={() => setIsMenuOpen(true)}
            type="button"
          >
            <MenuIcon className="size-5" />
          </button>
          <h1 className="truncate text-base font-semibold tracking-tight text-ink">
            {getPageTitle(pathname)}
          </h1>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
