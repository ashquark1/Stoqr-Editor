import { Product } from '@core/models/product';

/**
 * Fields searched independently (a query term matching any of these is a valid,
 * standalone search and acts as an "anchor" that enables secondary fields).
 */
export const CORE_FIELDS: readonly (keyof Product)[] = [
  'productName',
  'brand',
  'sku',
  'category',
];

/**
 * Secondary fields — only matched when the query also contains a core (anchor)
 * term. Searched alone, they trigger the validation message instead.
 */
export const SECONDARY_FIELDS: readonly (keyof Product)[] = [
  'size',
  'color',
  'packing',
];
