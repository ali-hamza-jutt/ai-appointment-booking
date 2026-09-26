import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";
import type { IconProps } from "./icons";

export interface EmptyStateProps {
  action?: ReactNode;
  className?: string;
  description?: ReactNode;
  icon: ComponentType<IconProps>;
  title: ReactNode;
}

export function EmptyState({
  action,
  className,
  description,
  icon: Icon,
  title,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center",
        className,
      )}
    >
      <Icon className="mx-auto size-8 text-subtle" />
      <h3 className="mt-4 text-sm font-semibold text-ink">{title}</h3>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
