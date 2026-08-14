import Link from "next/link";

import { BookWiseLogo } from "@/components/brand/bookwise-logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="text-center">
        <div className="mb-7 flex justify-center"><BookWiseLogo /></div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">Page not found</h1>
        <p className="mt-2 text-sm text-muted">The page you requested does not exist.</p>
        <Link className="mt-6 inline-flex min-h-10 items-center rounded-[10px] bg-brand px-4 text-sm font-semibold text-surface hover:bg-brand-hover" href="/book">
          Return to BookWise
        </Link>
      </div>
    </main>
  );
}
