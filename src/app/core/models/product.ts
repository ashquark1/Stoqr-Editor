import type { RowRef } from '@core/sheets/row-ref';

/**
 * Typed product model (same shape as V1). Rows are mapped into it by
 * `core/sheets/data-mapping.ts`, by header label.
 *
 * - The sheet's internal `id` column is NEVER on this model; a row is
 *   identified only by its opaque `RowRef` (AI_CONTRACT: Products).
 * - Numeric fields are nullable: a blank cell is `null`, never `0`.
 * - `stockStatus` is shown as read from the sheet until the quantity flow
 *   derives it (`deriveStockStatus`, Sprint 3).
 */
export interface Product {
  readonly productName: string;
  readonly brand: string;
  readonly category: string;
  readonly subCategory: string;
  readonly sku: string;
  readonly size: string;
  readonly color: string;
  readonly unitOfMeasure: string;
  readonly packing: string;
  readonly stockQty: number | null;
  readonly lowStockThreshold: number | null;
  readonly stockStatus: string;
  readonly mrp: number | null;
  readonly sellingPrice: number | null;
  readonly purchasePrice: number | null;
  readonly taxRate: number | null;
  readonly status: string;
  readonly notes: string;
  readonly lastUpdated: string;
  readonly createdAt: string;
}

/** Why a loaded row cannot be edited. */
export type ProductIssue = 'missing-id' | 'duplicate-id' | 'invalid-quantity';

export const PRODUCT_ISSUE_LABELS: Readonly<Record<ProductIssue, string>> = {
  'missing-id': 'Not editable: missing id',
  'duplicate-id': 'Not editable: duplicate id',
  'invalid-quantity': 'Not editable: stock qty is not a whole number ≥ 0',
};

/** A product as loaded from one sheet: what features receive. */
export interface LoadedProduct {
  readonly ref: RowRef;
  readonly product: Product;
  readonly issues: readonly ProductIssue[];
}

/** A row with any issue is loaded and shown, but never adjusted or edited. */
export function isEditable(loaded: LoadedProduct): boolean {
  return loaded.issues.length === 0;
}
