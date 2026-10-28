import { describe, expect, it } from 'vitest';

import { Product } from '@core/models/product';

import { SECONDARY_ONLY_MESSAGE, SearchValidation } from './search-validation';

function product(p: Partial<Product>): Product {
  return {
    productName: '', brand: '', category: '', subCategory: '', sku: '', size: '',
    color: '', unitOfMeasure: '', packing: '', stockQty: null, lowStockThreshold: null,
    stockStatus: '', mrp: null, sellingPrice: null, purchasePrice: null, taxRate: null,
    status: 'Active', notes: '', lastUpdated: '', createdAt: '', ...p,
  };
}

const PRODUCTS: Product[] = [
  product({ productName: 'Pulse Oximeter', brand: 'Dr Trust', color: 'Blue', size: 'Large' }),
];

describe('SearchValidation', () => {
  const v = new SearchValidation();

  it('returns the message for a secondary-only query (AC-13)', () => {
    expect(v.validate('blue', PRODUCTS)).toBe(SECONDARY_ONLY_MESSAGE);
    expect(v.validate('large blue', PRODUCTS)).toBe(SECONDARY_ONLY_MESSAGE);
  });

  it('returns null when the query anchors on a core field', () => {
    expect(v.validate('oximeter', PRODUCTS)).toBeNull();
    expect(v.validate('oximeter blue', PRODUCTS)).toBeNull();
  });

  it('returns null for an empty query', () => {
    expect(v.validate('', PRODUCTS)).toBeNull();
    expect(v.validate('   ', PRODUCTS)).toBeNull();
  });

  it('returns null for gibberish (no core or secondary hit)', () => {
    expect(v.validate('zzz', PRODUCTS)).toBeNull();
  });
});
