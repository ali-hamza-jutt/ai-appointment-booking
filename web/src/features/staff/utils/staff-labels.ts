const DEFAULT_PROVIDER_LABEL = "Staff member";

export interface ProviderLabels {
  plural: string;
  singular: string;
}

/** Vertical-specific wording, for example "Stylist" / "Stylists". */
export function getProviderLabels(providerLabel?: string): ProviderLabels {
  const singular = providerLabel ?? DEFAULT_PROVIDER_LABEL;

  return {
    singular,
    plural: providerLabel ? `${providerLabel}s` : "Staff",
  };
}
