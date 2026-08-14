import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export type BadgeTone = "brand" | "success" | "warning" | "neutral" | "danger";

export interface BadgeProps {
  children: ReactNode;
  className?: string;
  tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success-strong",
  warning: "bg-warning-soft text-warning-strong",
  neutral: "bg-surface-subtle text-muted",
  danger: "bg-danger-soft text-danger-strong",
};

export function Badge({ children, className, tone = "neutral" }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
