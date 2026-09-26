"use client";

import { useMemo, type SelectHTMLAttributes } from "react";

import { SelectField } from "@/components/ui/form-controls";
import { getSupportedTimeZones } from "@/lib/utils/time-zones";

interface TimeZoneSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  error?: string;
  hint?: string;
  id: string;
  label: string;
}

export function TimeZoneSelect({ value, ...props }: TimeZoneSelectProps) {
  const selectedTimeZone = typeof value === "string" ? value : "";
  const timeZones = useMemo(
    () => getSupportedTimeZones(selectedTimeZone),
    [selectedTimeZone],
  );

  return (
    <SelectField value={value} {...props}>
      {timeZones.map((timeZone) => (
        <option key={timeZone} value={timeZone}>
          {timeZone.replaceAll("_", " ")}
        </option>
      ))}
    </SelectField>
  );
}
