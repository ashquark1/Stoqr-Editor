import { Product } from '@core/models/product';
import { resolveProductStatus } from '@core/models/product-status';
import { StockVariant, resolveStockVariant } from '@core/stock-adjust/stock-status-display';

/**
 * Pure filter matching (US-57), copied from V1's `core/filter/product-filter.ts`
 * and `applyStatusVisibility` (V1 untouched). One difference: the Editor shows
 * every product by default, so a blank/unknown status is never hidden here.
 */

/** The facets a product can be filtered by (the four dropdowns). */
export type FacetKey = 'status' | 'category' | 'subCategory' | 'brand';

export const FACET_KEYS: readonly FacetKey[] = ['status', 'category', 'subCategory', 'brand'];

/** Each facet's value for a product. Stock status by its canonical variant; the rest raw. */
export const facetValue: Readonly<Record<FacetKey, (p: Product) => string>> = {
  status: (p) => resolveStockVariant(p.stockStatus),
  category: (p) => p.category,
  subCategory: (p) => p.subCategory,
  brand: (p) => p.brand,
};

/** Selected values per facet (an EMPTY set = "All" = not filtering). */
export type SelectedFilters = Readonly<Record<FacetKey, ReadonlySet<string>>>;

/** A dropdown option. */
export interface FilterOption {
  readonly value: string;
  readonly label: string;
}

/** The fixed Stock Status options (V1's order). */
export const STOCK_STATUS_OPTIONS: readonly FilterOption[] = [
  { value: 'in-stock' satisfies StockVariant, label: 'In Stock' },
  { value: 'low-stock' satisfies StockVariant, label: 'Low Stock' },
  { value: 'out-of-stock' satisfies StockVariant, label: 'Out of Stock' },
  { value: 'unknown' satisfies StockVariant, label: 'Unknown' },
];

/** The two visibility toggles. In the Editor both START ON (all products shown; V1 starts them off). */
export interface StatusToggles {
  readonly showInactive: boolean;
  readonly showDiscontinued: boolean;
}

/** Distinct, non-blank values of a field, sorted A–Z, as dropdown options. */
export function distinctOptions(products: readonly Product[], value: (p: Product) => string): FilterOption[] {
  const seen = new Set<string>();
  for (const p of products) {
    const v = value(p);
    if (v.trim() !== '') {
      seen.add(v);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
}

/** A product passes when every facet is unset or holds one of its selected values. */
export function applyFilters<T extends { readonly product: Product }>(rows: readonly T[], selected: SelectedFilters): T[] {
  return rows.filter((row) =>
    FACET_KEYS.every((facet) => {
      const sel = selected[facet];
      return sel.size === 0 || sel.has(facetValue[facet](row.product));
    }),
  );
}

/** Inactive and Discontinued only while their toggle is on; every other status always shows. */
export function applyStatusVisibility<T extends { readonly product: Product }>(
  rows: readonly T[],
  toggles: StatusToggles,
): T[] {
  return rows.filter((row) => {
    switch (resolveProductStatus(row.product.status)) {
      case 'inactive':
        return toggles.showInactive;
      case 'discontinued':
        return toggles.showDiscontinued;
      default:
        return true;
    }
  });
}
