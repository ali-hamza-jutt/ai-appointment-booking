const DEFAULT_FRACTION_DIGITS = 2;

/** Formats integer minor units (for example cents) as a localized amount. */
export function formatMinorAmount(minor: number, currency: string, locale = "en-US"): string {
  try {
    const formatter = new Intl.NumberFormat(locale, { currency, style: "currency" });
    const digits =
      formatter.resolvedOptions().maximumFractionDigits ?? DEFAULT_FRACTION_DIGITS;

    return formatter.format(minor / 10 ** digits);
  } catch {
    return `${(minor / 10 ** DEFAULT_FRACTION_DIGITS).toFixed(DEFAULT_FRACTION_DIGITS)} ${currency}`;
  }
}
