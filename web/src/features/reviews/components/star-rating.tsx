"use client";

import { StarIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";

const STARS = [1, 2, 3, 4, 5] as const;

/** Read-only stars, for example 4 of 5 filled. */
export function StarRating({ className, rating }: { className?: string; rating: number }) {
  return (
    <span aria-label={`${rating} out of 5 stars`} className={cn("inline-flex items-center gap-0.5", className)} role="img">
      {STARS.map((star) => (
        <StarIcon
          className={cn("size-4", star <= Math.round(rating) ? "fill-warning text-warning" : "text-border")}
          key={star}
        />
      ))}
    </span>
  );
}

/** Five star buttons to pick a rating with. */
export function StarInput({ onChange, value }: { onChange: (rating: number) => void; value: number }) {
  return (
    <div aria-label="Rating" className="flex items-center gap-1" role="radiogroup">
      {STARS.map((star) => (
        <button
          aria-checked={value === star}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          className="rounded-[6px] p-0.5 text-border transition-colors hover:text-warning focus-visible:outline-2 focus-visible:outline-brand"
          key={star}
          onClick={() => onChange(star)}
          role="radio"
          type="button"
        >
          <StarIcon className={cn("size-7", star <= value && "fill-warning text-warning")} />
        </button>
      ))}
    </div>
  );
}
