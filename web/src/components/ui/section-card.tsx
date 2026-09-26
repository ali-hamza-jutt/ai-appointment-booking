import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export interface SectionCardProps {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  footer?: ReactNode;
  title: ReactNode;
}

export function SectionCard({
  actions,
  children,
  className,
  description,
  footer,
  title,
}: SectionCardProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-surface shadow-card",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className="p-5 sm:p-6">{children}</div>
      {footer ? (
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-subtle px-5 py-3 sm:px-6">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
