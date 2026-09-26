import type { SelectHTMLAttributes } from "react";

import { SelectField } from "@/components/ui/form-controls";
import { BUSINESS_UI_CONSTANTS } from "@/features/business-settings/constants/business-ui.constants";

interface CurrencySelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  error?: string;
  hint?: string;
  id: string;
  label: string;
}

export function CurrencySelect({ value, ...props }: CurrencySelectProps) {
  const isKnown = BUSINESS_UI_CONSTANTS.CURRENCY_OPTIONS.some(
    (option) => option.value === value,
  );

  return (
    <SelectField value={value} {...props}>
      {!isKnown && typeof value === "string" ? (
        <option value={value}>{value}</option>
      ) : null}
      {BUSINESS_UI_CONSTANTS.CURRENCY_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </SelectField>
  );
}
