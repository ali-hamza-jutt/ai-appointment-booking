"use client";

import { cn } from "@/lib/utils/cn";

export interface TabOption<T extends string> {
  label: string;
  value: T;
}

interface TabsProps<T extends string> {
  ariaLabel: string;
  className?: string;
  controls?: string;
  onChange: (value: T) => void;
  options: ReadonlyArray<TabOption<T>>;
  value: T;
}

export function Tabs<T extends string>({
  ariaLabel,
  className,
  controls,
  onChange,
  options,
  value,
}: TabsProps<T>) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn("mb-5 flex gap-1 overflow-x-auto border-b border-border", className)}
      role="tablist"
    >
      {options.map((option) => {
        const isSelected = option.value === value;

        return (
          <button
            aria-controls={controls}
            aria-selected={isSelected}
            className={cn(
              "relative min-h-11 shrink-0 px-4 text-sm font-semibold transition-colors",
              isSelected ? "text-brand" : "text-muted hover:text-ink",
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="tab"
            type="button"
          >
            {option.label}
            {isSelected ? (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
