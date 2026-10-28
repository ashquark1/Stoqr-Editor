import { describe, expect, it } from 'vitest';

import { Product } from '@core/models/product';

import { analyzeQuery, filterProducts, tokenize } from './product-matcher';

function product(p: Partial<Product>): Product {
  return {
    productName: '',
    brand: '',
    category: '',
    subCategory: '',
    sku: '',
    size: '',
    color: '',
    unitOfMeasure: '',
    packing: '',
    stockQty: null,
    lowStockThreshold: null,
    stockStatus: '',
    mrp: null,
    sellingPrice: null,
    purchasePrice: null,
    taxRate: null,
    status: 'Active',
    notes: '',
    lastUpdated: '',
    createdAt: '',
    ...p,
  };
}

const PRODUCTS: Product[] = [
  product({ productName: 'Pulse Oximeter', brand: 'Dr Trust', sku: 'DTPO', category: 'Devices', color: 'Blue', size: 'Large' }),
  product({ productName: 'Bandage Roll', brand: 'Romsons', sku: 'RMB1', category: 'Consumables', color: 'White', size: 'Small' }),
];

describe('tokenize', () => {
  it('splits on whitespace, lowercases, drops empties', () => {
    expect(tokenize('  Pulse   Oximeter ')).toEqual(['pulse', 'oximeter']);
  });
});

describe('filterProducts — core fields', () => {
  it('matches product name, brand, sku, category independently (case-insensitive)', () => {
    expect(filterProducts(PRODUCTS, 'OXIMETER').map((p) => p.sku)).toEqual(['DTPO']);
    expect(filterProducts(PRODUCTS, 'romsons').map((p) => p.sku)).toEqual(['RMB1']);
    expect(filterProducts(PRODUCTS, 'dtpo').map((p) => p.sku)).toEqual(['DTPO']);
    expect(filterProducts(PRODUCTS, 'devices').map((p) => p.sku)).toEqual(['DTPO']);
  });
});

describe('filterProducts — AND across terms + secondary fields', () => {
  it('matches a secondary field only when anchored by a core term', () => {
    // "oximeter blue" → name~oximeter (anchor) AND color~blue
    expect(filterProducts(PRODUCTS, 'oximeter blue').map((p) => p.sku)).toEqual(['DTPO']);
    // "oximeter white" → name matches but colour does not → no match
    expect(filterProducts(PRODUCTS, 'oximeter white')).toEqual([]);
  });

  it('does not match a secondary field with no anchor', () => {
    // "blue" alone → secondary only, not eligible → no products
    expect(filterProducts(PRODUCTS, 'blue')).toEqual([]);
  });

  it('returns nothing when a term matches no eligible field', () => {
    expect(filterProducts(PRODUCTS, 'oximeter zzz')).toEqual([]);
  });
});

describe('analyzeQuery', () => {
  it('flags an anchor when a term matches a core field', () => {
    expect(analyzeQuery(PRODUCTS, 'oximeter')).toEqual({ anchor: true, secondaryHit: false });
  });

  it('flags secondaryHit when a term matches only a secondary field', () => {
    expect(analyzeQuery(PRODUCTS, 'blue')).toEqual({ anchor: false, secondaryHit: true });
  });

  it('anchor wins when both a core and secondary term are present', () => {
    expect(analyzeQuery(PRODUCTS, 'oximeter blue')).toEqual({ anchor: true, secondaryHit: true });
  });
});
