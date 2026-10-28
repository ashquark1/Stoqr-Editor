import { CellValue, mapSheet, resolveHeaders } from './data-mapping';
import { rowRefId } from './row-ref';
import { SheetLoadError } from './sheet-load-error';
import { HEADER, MASTER_SHEET, sheetRow, sheetValues } from './testing/sheet-fixtures';

/** Moves every column (header and rows alike) by the given index order. */
function reorder(values: CellValue[][], order: readonly number[]): CellValue[][] {
  return values.map((row) => order.map((i) => row[i]));
}

function loadError(run: () => unknown): SheetLoadError {
  try {
    run();
  } catch (error) {
    if (error instanceof SheetLoadError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected a SheetLoadError');
}

describe('mapSheet', () => {
  it('maps a row by header label into a typed product', () => {
    const [loaded] = mapSheet(MASTER_SHEET, sheetValues(sheetRow()));
    expect(loaded.product).toEqual({
      productName: 'BP Monitor',
      brand: 'Dr Trust',
      category: 'Health',
      subCategory: 'Monitors',
      sku: 'DT-BP-01',
      size: 'M',
      color: 'White',
      unitOfMeasure: 'pcs',
      packing: 'Box',
      stockQty: 10,
      lowStockThreshold: 5,
      stockStatus: 'In Stock',
      mrp: 2999,
      sellingPrice: 2499,
      purchasePrice: 1800,
      taxRate: 18,
      status: 'Active',
      notes: '',
      lastUpdated: '28/10/2026 10:00:00',
      createdAt: '01/01/2026',
    });
    expect(loaded.issues).toEqual([]);
    expect(loaded.ref.sheet).toBe('master');
    expect(rowRefId(loaded.ref)).toBe('row-1');
  });

  describe('rules', () => {
    it('is independent of column order (shuffled columns, same result)', () => {
      const values = sheetValues(sheetRow(), sheetRow({ id: 'row-2', sku: 'DT-2', 'stock qty': 0 }));
      const order = HEADER.map((_, i) => i).reverse();
      const strip = (products: ReturnType<typeof mapSheet>) =>
        products.map((p) => ({ product: p.product, issues: p.issues, id: rowRefId(p.ref) }));
      expect(strip(mapSheet(MASTER_SHEET, reorder(values, order)))).toEqual(
        strip(mapSheet(MASTER_SHEET, values)),
      );
    });

    it('never puts the id on a product or anywhere a feature can read it', () => {
      const secret = 'secret-row-id-42';
      const [loaded] = mapSheet(MASTER_SHEET, sheetValues(sheetRow({ id: secret })));
      expect(Object.keys(loaded.product)).not.toContain('id');
      expect(JSON.stringify(loaded)).not.toContain(secret);
      expect(Object.values(loaded.ref)).not.toContain(secret);
    });

    it('a missing or duplicated required header never yields partial data', () => {
      const missing = sheetValues(sheetRow()).map((row) => row.filter((_, i) => HEADER[i] !== 'mrp'));
      expect(() => mapSheet(MASTER_SHEET, missing)).toThrow(SheetLoadError);
      const duplicated = sheetValues(sheetRow()).map((row) => [...row, row[HEADER.indexOf('sku')]]);
      expect(() => mapSheet(MASTER_SHEET, duplicated)).toThrow(SheetLoadError);
    });

    it('does not mutate its input', () => {
      const values = sheetValues(sheetRow(), sheetRow({ id: '' }));
      const before = JSON.stringify(values);
      mapSheet(MASTER_SHEET, values);
      expect(JSON.stringify(values)).toBe(before);
    });
  });

  describe('headers', () => {
    it('matches labels trimmed, case-insensitively, with inner spaces collapsed', () => {
      const values = sheetValues(sheetRow());
      values[0] = HEADER.map((label) => `  ${label.toUpperCase().replace(' ', '   ')} `);
      expect(mapSheet(MASTER_SHEET, values)[0].product.stockQty).toBe(10);
    });

    it('ignores extra columns, even repeated ones', () => {
      const values = sheetValues(sheetRow()).map((row, r) =>
        r === 0 ? ['remarks', ...row, 'remarks'] : ['x', ...row, 'y'],
      );
      expect(mapSheet(MASTER_SHEET, values)[0].product.sku).toBe('DT-BP-01');
    });

    it('names the sheet and the missing column', () => {
      const header = HEADER.filter((label) => label !== 'stock qty');
      expect(loadError(() => resolveHeaders(MASTER_SHEET, header)).message).toBe(
        'Master sheet is missing column: stock qty',
      );
    });

    it('names every missing and duplicated column', () => {
      const header = [...HEADER.filter((l) => l !== 'mrp' && l !== 'notes'), 'SKU'];
      const error = loadError(() => resolveHeaders(MASTER_SHEET, header));
      expect(error.kind).toBe('columns');
      expect(error.sheetLabel).toBe('Master');
      expect(error.message).toBe(
        'Master sheet is missing columns: mrp, notes and has duplicate column: sku',
      );
    });

    it('treats an empty tab (no values at all) as missing every column', () => {
      expect(loadError(() => mapSheet(MASTER_SHEET, undefined)).message).toContain(
        'is missing columns: id, brand',
      );
    });

    it('loads a header-only sheet as zero products', () => {
      expect(mapSheet(MASTER_SHEET, sheetValues())).toEqual([]);
    });
  });

  describe('rows and cells', () => {
    it('skips completely blank rows', () => {
      const blank = HEADER.map(() => '');
      expect(mapSheet(MASTER_SHEET, sheetValues(sheetRow(), blank, [], sheetRow({ id: 'r2' })))).toHaveLength(2);
    });

    it('pads short rows (Sheets omits trailing empty cells)', () => {
      const short = sheetRow().slice(0, HEADER.indexOf('stock qty'));
      const [loaded] = mapSheet(MASTER_SHEET, sheetValues(short));
      expect(loaded.product.sku).toBe('DT-BP-01');
      expect(loaded.product.mrp).toBeNull();
      expect(loaded.product.notes).toBe('');
      expect(loaded.issues).toEqual(['invalid-quantity']);
    });

    it('shows numeric SKU and packing cells as text', () => {
      const [loaded] = mapSheet(MASTER_SHEET, sheetValues(sheetRow({ sku: 123, packing: 12 })));
      expect(loaded.product.sku).toBe('123');
      expect(loaded.product.packing).toBe('12');
    });

    it('parses numbers: numeric text converted, blank or non-numeric is null (never 0)', () => {
      const [loaded] = mapSheet(
        MASTER_SHEET,
        sheetValues(sheetRow({ mrp: ' 2999 ', 'selling price': '', 'purchase price': 'n/a' })),
      );
      expect(loaded.product.mrp).toBe(2999);
      expect(loaded.product.sellingPrice).toBeNull();
      expect(loaded.product.purchasePrice).toBeNull();
    });
  });

  describe('issues', () => {
    it('flags a blank id', () => {
      expect(mapSheet(MASTER_SHEET, sheetValues(sheetRow({ id: '  ' })))[0].issues).toEqual([
        'missing-id',
      ]);
    });

    it('flags every row sharing an id within the sheet', () => {
      const loaded = mapSheet(
        MASTER_SHEET,
        sheetValues(sheetRow({ id: 'dup' }), sheetRow({ id: 'dup' }), sheetRow({ id: 'ok' })),
      );
      expect(loaded.map((p) => p.issues)).toEqual([['duplicate-id'], ['duplicate-id'], []]);
    });

    it.each<[string, CellValue]>([
      ['negative', -1],
      ['decimal', 2.5],
      ['blank', ''],
      ['text', 'ten'],
    ])('flags a %s stock qty and loads it as null', (_case, qty) => {
      const [loaded] = mapSheet(MASTER_SHEET, sheetValues(sheetRow({ 'stock qty': qty })));
      expect(loaded.product.stockQty).toBeNull();
      expect(loaded.issues).toEqual(['invalid-quantity']);
    });

    it('accepts a stock qty of 0 and whole-number text', () => {
      const loaded = mapSheet(
        MASTER_SHEET,
        sheetValues(sheetRow({ 'stock qty': 0 }), sheetRow({ id: 'r2', 'stock qty': '7' })),
      );
      expect(loaded.map((p) => p.product.stockQty)).toEqual([0, 7]);
      expect(loaded.every((p) => p.issues.length === 0)).toBe(true);
    });
  });
});
