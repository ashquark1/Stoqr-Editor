/** The four stock-status pill variants (match the theme's `.stoqr-badge--*`). */
export type StockVariant = 'in-stock' | 'low-stock' | 'out-of-stock' | 'unknown';

const STOCK_VARIANTS: Readonly<Record<string, StockVariant>> = {
  'in stock': 'in-stock',
  'low stock': 'low-stock',
  'out of stock': 'out-of-stock',
};

/**
 * Display only: maps a sheet Stock Status text (trimmed, case-insensitive) to a
 * pill variant; anything else is `unknown`. Copied from V1 without its filter
 * options. Deriving the status from quantity is `deriveStockStatus` (Sprint 3).
 */
export function resolveStockVariant(status: string | null | undefined): StockVariant {
  return STOCK_VARIANTS[(status ?? '').trim().toLowerCase()] ?? 'unknown';
}

/** Pill text: the sheet's own text, or "Unknown" when blank. */
export function stockLabel(status: string | null | undefined): string {
  const text = (status ?? '').trim();
  return text === '' ? 'Unknown' : text;
}
