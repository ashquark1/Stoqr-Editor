import { FIELD_LABELS } from '@core/sheets/field-map';
import { DETAIL_FIELDS, DETAIL_SECTIONS, EDITABLE_DETAILS, byDetailField } from './details-fields';

describe('details fields (US-21)', () => {
  it('rule: lists every product field exactly once, and never id', () => {
    const keys = DETAIL_FIELDS.map((def) => def.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(Object.keys(FIELD_LABELS).sort());
    expect(keys as string[]).not.toContain('id');
    expect(DETAIL_FIELDS.map((def) => def.label.toLowerCase())).not.toContain('id');
  });

  it('rule: Stock Qty, Stock Status, Last Updated and Created At are locked; everything else is editable', () => {
    const locked = DETAIL_FIELDS.filter((def) => !def.editable).map((def) => def.key);
    expect(locked).toEqual(['stockQty', 'stockStatus', 'lastUpdated', 'createdAt']);
    expect(EDITABLE_DETAILS).toHaveLength(16);
  });

  it('rule: required fields are the owner list (2026-10-29)', () => {
    const required = EDITABLE_DETAILS.filter((def) => def.required).map((def) => def.key).sort();
    expect(required).toEqual(
      [
        'brand',
        'productName',
        'category',
        'subCategory',
        'sku',
        'unitOfMeasure',
        'packing',
        'lowStockThreshold',
        'taxRate',
        'status',
      ].sort(),
    );
  });

  it('number kinds: threshold is whole; prices and tax rate are numbers; the rest text', () => {
    const kinds = Object.fromEntries(EDITABLE_DETAILS.map((def) => [def.key, def.kind]));
    expect(kinds['lowStockThreshold']).toBe('whole');
    for (const key of ['mrp', 'sellingPrice', 'purchasePrice', 'taxRate']) {
      expect(kinds[key]).toBe('number');
    }
    expect(EDITABLE_DETAILS.filter((def) => def.kind === 'text')).toHaveLength(11);
  });

  it("uses V1's groups and order", () => {
    expect(DETAIL_SECTIONS.map((s) => [s.title, s.fields.map((f) => f.label)])).toEqual([
      ['Product Info', ['Product Name', 'Brand', 'Category', 'Sub-category', 'SKU', 'Size', 'Color', 'Status']],
      ['Stock Info', ['Stock Qty', 'Low Stock Threshold', 'Stock Status', 'Unit of Measure', 'Packing']],
      ['Pricing Info', ['MRP', 'Selling Price', 'Purchase Price', 'Tax Rate']],
      ['Additional Info', ['Notes', 'Last Updated', 'Created At']],
    ]);
  });

  it('byDetailField builds one entry per editable field', () => {
    const record = byDetailField((field) => field.length);
    expect(Object.keys(record).sort()).toEqual(EDITABLE_DETAILS.map((def) => def.key).sort());
  });
});
