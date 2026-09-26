"use client";

import { SelectField } from "@/components/ui/form-controls";
import { useActiveBusiness } from "@/features/business-settings/context/active-business-context";

export function BusinessSwitcher() {
  const { activeBusiness, businesses, selectBusiness } = useActiveBusiness();

  if (!activeBusiness) return null;

  if (businesses.length === 1) {
    return (
      <p className="truncate px-3 text-sm font-semibold text-ink" title={activeBusiness.name}>
        {activeBusiness.name}
      </p>
    );
  }

  return (
    <SelectField
      className="h-9"
      hideLabel
      id="active-business"
      label="Active business"
      onChange={(event) => selectBusiness(event.target.value)}
      value={activeBusiness.id}
    >
      {businesses.map((business) => (
        <option key={business.id} value={business.id}>
          {business.name}
        </option>
      ))}
    </SelectField>
  );
}
