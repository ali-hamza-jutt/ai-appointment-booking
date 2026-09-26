const supportedCurrencies = new Set(Intl.supportedValuesOf("currency"));

export function normalizeCurrencyCode(value: string): string | null {
  const currency = value.trim().toUpperCase();

  return supportedCurrencies.has(currency) ? currency : null;
}
