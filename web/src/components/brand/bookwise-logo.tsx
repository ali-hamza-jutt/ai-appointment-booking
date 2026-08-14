import Link from "next/link";

import { LogoIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";

export interface BookWiseLogoProps {
  compact?: boolean;
  className?: string;
  href?: string;
}

export function BookWiseLogo({
  compact = false,
  className,
  href = "/book",
}: BookWiseLogoProps) {
  return (
    <Link
      aria-label="BookWise AI home"
      className={cn("inline-flex items-center gap-2.5", className)}
      href={href}
    >
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg bg-brand text-surface",
          compact ? "size-7.5" : "size-8.5",
        )}
      >
        <LogoIcon className={compact ? "size-4" : "size-5"} />
      </span>
      <span
        className={cn(
          "font-bold tracking-tight text-ink",
          compact ? "text-base" : "text-xl",
        )}
      >
        BookWise <span className="text-brand">AI</span>
      </span>
    </Link>
  );
}
