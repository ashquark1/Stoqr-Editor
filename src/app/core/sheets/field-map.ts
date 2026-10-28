import { Product } from '@core/models/product';

/** The sheet's internal row identifier. Read into `RowRef` only; never a `Product` field. */
export const ID_LABEL = 'id';

/**
 * Product field -> sheet header label (matched after `normalizeLabel`). Columns
 * are mapped by LABEL, never by position, so reordering columns cannot corrupt
 * data. Typed as a full record, so adding a `Product` field without a label
 * fails to compile.
 */
export const FIELD_LABELS: Readonly<Record<keyof Product, string>> = {
  brand: 'brand',
  productName: 'product name',
  category: 'category',
  subCategory: 'sub category',
  sku: 'sku',
  size: 'size',
  color: 'color',
  unitOfMeasure: 'unit of measure',
  packing: 'packing',
  stockQty: 'stock qty',
  lowStockThreshold: 'low stock threshold',
  stockStatus: 'stock status',
  mrp: 'mrp',
  sellingPrice: 'selling price',
  purchasePrice: 'purchase price',
  taxRate: 'tax rate',
  status: 'status',
  notes: 'notes',
  lastUpdated: 'last updated',
  createdAt: 'created at',
};

/** All 21 headers each sheet must have exactly once. */
export const REQUIRED_LABELS: readonly string[] = [ID_LABEL, ...Object.values(FIELD_LABELS)];

/** Header matching (same as V1): trimmed, case-insensitive, inner whitespace collapsed. */
export function normalizeLabel(label: unknown): string {
  return String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
