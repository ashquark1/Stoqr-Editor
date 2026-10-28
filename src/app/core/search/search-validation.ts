import { Injectable } from '@angular/core';

import { Product } from '@core/models/product';

import { analyzeQuery, tokenize } from './product-matcher';

/** Shown when a query targets only secondary fields (AC-13). */
export const SECONDARY_ONLY_MESSAGE =
  'Please include a product name or brand in your search.';

/**
 * Validates search queries against the secondary-field rule. A query that
 * references only Size/Color/Packing (no Name/Brand/SKU/Category anchor) is
 * unsupported and returns a helpful message instead of (empty) results.
 */
@Injectable({ providedIn: 'root' })
export class SearchValidation {
  validate(query: string, products: readonly Product[]): string | null {
    if (tokenize(query).length === 0) {
      return null;
    }
    const { anchor, secondaryHit } = analyzeQuery(products, query);
    return !anchor && secondaryHit ? SECONDARY_ONLY_MESSAGE : null;
  }
}
