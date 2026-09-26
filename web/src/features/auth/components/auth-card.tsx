import type { ReactNode } from "react";

interface AuthCardProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/** The card every sign-in, sign-up and account-recovery screen sits in. */
export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-card sm:p-8">
      <h1 className="text-[22px] font-bold tracking-tight text-ink">{title}</h1>
      {description ? <p className="mb-6 mt-1 text-sm text-muted">{description}</p> : null}
      {children}
      {footer ? <div className="mt-5 text-center text-sm text-muted">{footer}</div> : null}
    </section>
  );
}

/** A text link in the brand colour, used in auth card footers. */
export const AUTH_LINK_CLASS = "font-semibold text-brand hover:text-brand-hover";
