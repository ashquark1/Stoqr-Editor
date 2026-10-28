import { Product } from '@core/models/product';

import { CORE_FIELDS, SECONDARY_FIELDS } from './search-fields';

/** Split a query into lowercased, non-empty terms. */
export function tokenize(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function fieldText(p: Product, field: keyof Product): string {
  const value = p[field];
  return value == null ? '' : String(value).toLowerCase();
}

function termMatchesFields(
  term: string,
  p: Product,
  fields: readonly (keyof Product)[],
): boolean {
  return fields.some((f) => fieldText(p, f).includes(term));
}

export interface QueryAnalysis {
  /** Some term matches a CORE field of some product (enables secondary fields). */
  readonly anchor: boolean;
  /** Some term matches only a SECONDARY field (no core) of some product. */
  readonly secondaryHit: boolean;
}

/** Classify a query against the dataset: does it anchor on a core field, and
 *  does it reference a secondary field without one? */
export function analyzeQuery(
  products: readonly Product[],
  query: string,
): QueryAnalysis {
  let anchor = false;
  let secondaryHit = false;

  for (const term of tokenize(query)) {
    if (products.some((p) => termMatchesFields(term, p, CORE_FIELDS))) {
      anchor = true;
      continue;
    }
    if (products.some((p) => termMatchesFields(term, p, SECONDARY_FIELDS))) {
      secondaryHit = true;
    }
  }

  return { anchor, secondaryHit };
}

/**
 * Filter products by the query (case-insensitive, AND across terms). Secondary
 * fields are eligible only when the query anchors on a core field; otherwise
 * only core fields are matched.
 */
export function filterProducts(
  products: readonly Product[],
  query: string,
): Product[] {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return [...products];
  }
  const { anchor } = analyzeQuery(products, query);
  const eligible = anchor ? [...CORE_FIELDS, ...SECONDARY_FIELDS] : CORE_FIELDS;
  return products.filter((p) =>
    terms.every((term) => termMatchesFields(term, p, eligible)),
  );
}
