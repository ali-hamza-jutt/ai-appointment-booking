import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";
import { AlertIcon, InfoIcon } from "./icons";

export interface AlertProps {
  children: ReactNode;
  className?: string;
  tone?: "danger" | "warning" | "info" | "success";
}

const alertToneClasses = {
  danger: "border-danger-border bg-danger-soft text-danger-strong",
  warning: "border-warning-border bg-warning-soft text-warning-strong",
  info: "border-border bg-surface-subtle text-ink-soft",
  success: "border-success-border bg-success-soft text-success-strong",
} as const;

export function Alert({ children, className, tone = "info" }: AlertProps) {
  const Icon = tone === "danger" || tone === "warning" ? AlertIcon : InfoIcon;

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-[10px] border px-3 py-2.5 text-xs leading-5",
        alertToneClasses[tone],
        className,
      )}
      role={tone === "danger" ? "alert" : "status"}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-label="Loading"
      className={cn(
        "animate-bw-spin inline-block size-5 rounded-full border-2 border-brand-soft border-t-brand",
        className,
      )}
      role="status"
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("bw-skeleton block rounded-md", className)}
    />
  );
}
