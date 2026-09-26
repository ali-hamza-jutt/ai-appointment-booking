"use client";

import { Alert, Skeleton } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import type { AvailableSlot } from "@/generated/api/models";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { cn } from "@/lib/utils/cn";

interface SlotPickerProps {
  date: string;
  emptyMessage?: string;
  error?: Error | null;
  idPrefix: string;
  isLoading: boolean;
  minDate?: string;
  onDateChange: (date: string) => void;
  onSelect: (slot: AvailableSlot) => void;
  selectedStartsAt: string | null;
  slots: AvailableSlot[];
  timeZone: string;
}

/** A date input plus the open start times for that date. */
export function SlotPicker({
  date,
  emptyMessage = "No open times on this date. Try another day.",
  error,
  idPrefix,
  isLoading,
  minDate,
  onDateChange,
  onSelect,
  selectedStartsAt,
  slots,
  timeZone,
}: SlotPickerProps) {
  return (
    <div className="space-y-3">
      <TextField
        hint={`Times are shown in ${timeZone.replaceAll("_", " ")}.`}
        id={`${idPrefix}-date`}
        label="Date"
        min={minDate}
        onChange={(event) => onDateChange(event.target.value)}
        type="date"
        value={date}
      />
      <fieldset>
        <legend className="mb-1.5 block text-xs font-semibold text-ink">Time</legend>
        {!date ? (
          <p className="text-xs text-muted">Choose a date to see open times.</p>
        ) : isLoading ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton className="h-10 rounded-[10px]" key={item} />
            ))}
          </div>
        ) : error ? (
          <Alert tone="danger">
            {getApiErrorMessage(error, "Open times could not be loaded.")}
          </Alert>
        ) : slots.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-border-strong px-3 py-2.5 text-xs text-muted">
            {emptyMessage}
          </p>
        ) : (
          <div className="bw-scrollbar grid max-h-56 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4" role="radiogroup">
            {slots.map((slot) => {
              const startsAt = String(slot.startsAt);
              const isSelected = selectedStartsAt === startsAt;

              return (
                <button
                  aria-checked={isSelected}
                  className={cn(
                    "min-h-10 rounded-[10px] border px-2 text-sm font-semibold transition-colors",
                    isSelected
                      ? "border-brand bg-brand text-surface"
                      : "border-border bg-surface text-ink-soft hover:border-brand hover:text-brand",
                  )}
                  key={startsAt}
                  onClick={() => onSelect(slot)}
                  role="radio"
                  type="button"
                >
                  {slot.time}
                  {slot.seatsLeft !== null ? (
                    <span className="block text-[10px] font-medium opacity-80">
                      {slot.seatsLeft} left
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>
    </div>
  );
}
