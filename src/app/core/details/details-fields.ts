import { Product } from '@core/models/product';
import { WritableField } from '@core/sheets/approval';

/**
 * Fields the details form edits (US-21): every writable field except Stock Qty,
 * which changes only through the adjuster (DECISIONS). `id` is not a `Product`
 * field, so it can never appear here.
 */
export type DetailField = Exclude<WritableField, 'stockQty'>;

export type DetailGroup = 'product' | 'stock' | 'pricing' | 'additional';

/** How typed text is checked: any text, a number >= 0, or a whole number 0–1,000,000. */
export type DetailKind = 'text' | 'number' | 'whole';

export interface EditableDetail {
  readonly key: DetailField;
  readonly label: string;
  readonly group: DetailGroup;
  readonly editable: true;
  readonly kind: DetailKind;
  /** Must not be blank (owner, 2026-10-29). */
  readonly required: boolean;
  readonly mono?: boolean;
  readonly multiline?: boolean;
}

/** Shown, never typed: Stock Qty (adjuster), Stock Status (derived), Last Updated (stamped), Created At. */
export interface LockedDetail {
  readonly key: Exclude<keyof Product, DetailField>;
  readonly label: string;
  readonly group: DetailGroup;
  readonly editable: false;
  readonly badge?: boolean;
}

export type DetailDef = EditableDetail | LockedDetail;

const text = (key: DetailField, label: string, group: DetailGroup, required: boolean): EditableDetail => ({
  key,
  label,
  group,
  editable: true,
  kind: 'text',
  required,
});

/** Every product field once, in V1's groups and order (V1 `product-fields.ts`). */
export const DETAIL_FIELDS: readonly DetailDef[] = [
  // Product Info
  text('productName', 'Product Name', 'product', true),
  text('brand', 'Brand', 'product', true),
  text('category', 'Category', 'product', true),
  text('subCategory', 'Sub-category', 'product', true),
  { ...text('sku', 'SKU', 'product', true), mono: true },
  text('size', 'Size', 'product', false),
  text('color', 'Color', 'product', false),
  text('status', 'Status', 'product', true),
  // Stock Info
  { key: 'stockQty', label: 'Stock Qty', group: 'stock', editable: false },
  { key: 'lowStockThreshold', label: 'Low Stock Threshold', group: 'stock', editable: true, kind: 'whole', required: true },
  { key: 'stockStatus', label: 'Stock Status', group: 'stock', editable: false, badge: true },
  text('unitOfMeasure', 'Unit of Measure', 'stock', true),
  text('packing', 'Packing', 'stock', true),
  // Pricing Info
  { key: 'mrp', label: 'MRP', group: 'pricing', editable: true, kind: 'number', required: false },
  { key: 'sellingPrice', label: 'Selling Price', group: 'pricing', editable: true, kind: 'number', required: false },
  { key: 'purchasePrice', label: 'Purchase Price', group: 'pricing', editable: true, kind: 'number', required: false },
  { key: 'taxRate', label: 'Tax Rate', group: 'pricing', editable: true, kind: 'number', required: true },
  // Additional Info
  { ...text('notes', 'Notes', 'additional', false), multiline: true },
  { key: 'lastUpdated', label: 'Last Updated', group: 'additional', editable: false },
  { key: 'createdAt', label: 'Created At', group: 'additional', editable: false },
];

export const EDITABLE_DETAILS: readonly EditableDetail[] = DETAIL_FIELDS.filter(
  (def): def is EditableDetail => def.editable,
);

const GROUP_TITLES: Readonly<Record<DetailGroup, string>> = {
  product: 'Product Info',
  stock: 'Stock Info',
  pricing: 'Pricing Info',
  additional: 'Additional Info',
};

export interface DetailSection {
  readonly group: DetailGroup;
  readonly title: string;
  readonly fields: readonly DetailDef[];
}

/** The form's sections, in order. */
export const DETAIL_SECTIONS: readonly DetailSection[] = (Object.keys(GROUP_TITLES) as DetailGroup[]).map(
  (group) => ({ group, title: GROUP_TITLES[group], fields: DETAIL_FIELDS.filter((def) => def.group === group) }),
);

/**
 * A record with one entry per editable field. The single cast is safe: the
 * entries come from `EDITABLE_DETAILS`, which the spec proves is every
 * `DetailField` exactly once.
 */
export function byDetailField<V>(value: (field: DetailField) => V): Record<DetailField, V> {
  return Object.fromEntries(EDITABLE_DETAILS.map((def) => [def.key, value(def.key)])) as Record<DetailField, V>;
}
