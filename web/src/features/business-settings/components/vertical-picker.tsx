"use client";

import { Skeleton } from "@/components/ui/feedback";
import { VERTICAL_ICONS } from "@/features/business-settings/constants/business-ui.constants";
import type {
  BusinessVertical,
  BusinessVerticalResponse,
} from "@/generated/api/models";
import { cn } from "@/lib/utils/cn";

interface VerticalPickerProps {
  error?: string;
  isLoading?: boolean;
  onChange: (vertical: BusinessVertical) => void;
  value: BusinessVertical | null;
  verticals: BusinessVerticalResponse[];
}

export function VerticalPicker({
  error,
  isLoading = false,
  onChange,
  value,
  verticals,
}: VerticalPickerProps) {
  return (
    <fieldset>
      <legend className="mb-1.5 block text-xs font-semibold text-ink">
        Business type
      </legend>
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton className="h-20 rounded-xl" key={item} />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
          {verticals.map((vertical) => {
            const Icon = VERTICAL_ICONS[vertical.id];
            const isSelected = value === vertical.id;

            return (
              <button
                aria-checked={isSelected}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                  isSelected
                    ? "border-brand bg-brand-soft"
                    : "border-border bg-surface hover:border-border-strong hover:bg-surface-subtle",
                )}
                key={vertical.id}
                onClick={() => onChange(vertical.id)}
                role="radio"
                type="button"
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
                    isSelected ? "bg-brand text-surface" : "bg-surface-subtle text-brand",
                  )}
                >
                  <Icon className="size-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">
                    {vertical.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted">
                    {vertical.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {error ? (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
