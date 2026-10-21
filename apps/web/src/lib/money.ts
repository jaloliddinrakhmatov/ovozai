/**
 * Money helpers for the billing screens. Amounts arrive as integer minor units
 * (`priceCents`) plus a currency code (e.g. `UZS`, `USD`). Formatting is pinned
 * to a fixed locale so it is deterministic and SSR-safe.
 */

const amountFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format integer minor units + currency for display (e.g. `49,000.00 UZS`). */
export function formatMoney(priceCents: number, currency: string): string {
  if (!Number.isFinite(priceCents)) return `— ${currency}`;
  return `${amountFormatter.format(priceCents / 100)} ${currency}`;
}
