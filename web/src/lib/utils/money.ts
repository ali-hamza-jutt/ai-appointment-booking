const DEFAULT_FRACTION_DIGITS = 2;

export function getCurrencyFractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en-US", { currency, style: "currency" }).resolvedOptions()
        .maximumFractionDigits ?? DEFAULT_FRACTION_DIGITS
    );
  } catch {
    return DEFAULT_FRACTION_DIGITS;
  }
}

export function formatMoney(minor: number, currency: string): string {
  const fractionDigits = getCurrencyFractionDigits(currency);

  try {
    return new Intl.NumberFormat("en-US", { currency, style: "currency" }).format(
      minor / 10 ** fractionDigits,
    );
  } catch {
    return `${(minor / 10 ** fractionDigits).toFixed(fractionDigits)} ${currency}`;
  }
}

/** Converts stored minor units to an editable major-unit string. */
export function minorToMajorInput(minor: number, currency: string): string {
  const fractionDigits = getCurrencyFractionDigits(currency);

  return (minor / 10 ** fractionDigits).toFixed(fractionDigits);
}

/** Parses a major-unit input such as "25.50" into integer minor units. */
export function majorInputToMinor(value: string, currency: string): number | null {
  const trimmed = value.trim();
  const fractionDigits = getCurrencyFractionDigits(currency);
  const pattern =
    fractionDigits > 0
      ? new RegExp(`^\\d+(?:\\.\\d{1,${fractionDigits}})?$`)
      : /^\d+$/;

  if (!pattern.test(trimmed)) return null;

  const [whole = "0", fraction = ""] = trimmed.split(".");

  return Number(whole) * 10 ** fractionDigits + Number(fraction.padEnd(fractionDigits, "0") || 0);
}
