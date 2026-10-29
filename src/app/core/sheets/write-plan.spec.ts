import { Product } from '@core/models/product';
import { deriveStockStatus } from '@core/stock-adjust/stock-status';
import { InvalidChangeError, ProductChanges, RowChange } from './approval';
import { CellValue, mapSheet } from './data-mapping';
import { SheetLoadError } from './sheet-load-error';
import { formatSheetTimestamp, toSheetSerial } from './sheet-timestamp';
import { HEADER, MASTER_SHEET, sheetRow, sheetValues } from './testing/sheet-fixtures';
import { CellWrite, planRowWrite } from './write-plan';

const NOW = new Date(2026, 9, 28, 14, 26, 3);
const values = sheetValues(
  sheetRow({ id: 'row-1', 'stock qty': 10, 'low stock threshold': 5, notes: 'old note' }),
  sheetRow({ id: 'row-2', 'stock qty': 3 }),
);
const [first] = mapSheet(MASTER_SHEET, values);

function change(changes: ProductChanges, reviewed: Partial<Product> = { stockQty: 10 }): RowChange {
  return { target: first.ref, reviewed, changes };
}

function ready(plan: ReturnType<typeof planRowWrite>): readonly CellWrite[] {
  if (plan.kind !== 'ready') {
    throw new Error(`expected a ready plan, got ${plan.kind}`);
  }
  return plan.writes;
}

/** Writes as `range → value`, for readable expectations. */
const cells = (writes: readonly CellWrite[]) => Object.fromEntries(writes.map((w) => [w.range, w.value]));

describe('planRowWrite', () => {
  it('writes the qty, its derived Stock Status and Last Updated, as exact cells in the row', () => {
    const writes = ready(planRowWrite(MASTER_SHEET, values, 'row-1', change({ stockQty: 4 }), NOW));
    expect(cells(writes)).toEqual({
      "'Sheet1'!K2": 4,
      "'Sheet1'!M2": 'Low Stock',
      "'Sheet1'!T2": toSheetSerial(NOW),
    });
  });

  it('returns the 0-based grid cell of the Last Updated it stamps (row by id, column by label)', () => {
    const reversed = [[...HEADER].reverse(), sheetRow({ id: 'row-2' }).reverse(), sheetRow({ id: 'row-1' }).reverse()];
    const plan = planRowWrite(MASTER_SHEET, reversed, 'row-1', change({ stockQty: 4 }), NOW);
    if (plan.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(plan.stampCell).toEqual({ rowIndex: 2, columnIndex: 1 });
    expect(plan.writes.find((w) => w.field === 'lastUpdated')?.range).toBe("'Sheet1'!B3");
  });

  it('returns the expected row after the write (for showing confirmed values)', () => {
    const plan = planRowWrite(MASTER_SHEET, values, 'row-1', change({ stockQty: 0 }), NOW);
    if (plan.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(plan.expected).toMatchObject({ stockQty: 0, stockStatus: 'Out of Stock', lastUpdated: formatSheetTimestamp(NOW) });
    expect(plan.current.product.stockQty).toBe(10);
  });

  describe('rules', () => {
    it('every stock qty write carries deriveStockStatus for that same qty', () => {
      for (const qty of [0, 1, 4, 5, 6, 99]) {
        const writes = ready(planRowWrite(MASTER_SHEET, values, 'row-1', change({ stockQty: qty }), NOW));
        expect(writes.find((w) => w.field === 'stockStatus')?.value).toBe(deriveStockStatus(qty, 5));
      }
    });

    it('Last Updated is written on every write', () => {
      const writes = ready(planRowWrite(MASTER_SHEET, values, 'row-1', change({ notes: 'x' }), NOW));
      expect(writes.find((w) => w.field === 'lastUpdated')?.value).toBe(toSheetSerial(NOW));
    });

    it('never writes id or Created At, and only single cells', () => {
      const writes = ready(
        planRowWrite(MASTER_SHEET, values, 'row-1', change({ stockQty: 2, notes: 'n', sku: 'S-9' }), NOW),
      );
      const idColumn = 'A';
      const createdAtColumn = 'U';
      for (const w of writes) {
        expect(w.range).toMatch(/^'Sheet1'![A-Z]+\d+$/);
        expect(w.range).not.toMatch(new RegExp(`!(${idColumn}|${createdAtColumn})\\d+$`));
      }
    });

    it('a formula-looking text is just text (sent as-is; RAW stores it as text)', () => {
      const writes = ready(planRowWrite(MASTER_SHEET, values, 'row-1', change({ notes: '=SUM(A1:A9)' }), NOW));
      expect(writes.find((w) => w.field === 'notes')?.value).toBe('=SUM(A1:A9)');
    });
  });

  it('finds moved columns by label (reordered since the load)', () => {
    // Reversing all 21 columns moves notes from S (index 18) to C, and last updated from T to B.
    const reversed = values.map((row) => [...row].reverse());
    const writes = ready(planRowWrite(MASTER_SHEET, reversed, 'row-1', change({ notes: 'n' }), NOW));
    expect(writes.find((w) => w.field === 'notes')?.range).toBe("'Sheet1'!C2");
    expect(writes.find((w) => w.field === 'lastUpdated')?.range).toBe("'Sheet1'!B2");
  });

  it('finds the row by id, not by position', () => {
    const swapped = [values[0], values[2], values[1]];
    const writes = ready(planRowWrite(MASTER_SHEET, swapped, 'row-1', change({ stockQty: 4 }), NOW));
    expect(writes[0].range).toBe("'Sheet1'!K3");
  });

  it('a threshold change alone derives Stock Status from the fresh qty', () => {
    const writes = ready(
      planRowWrite(MASTER_SHEET, values, 'row-1', change({ lowStockThreshold: 20 }), NOW),
    );
    expect(cells(writes)).toEqual({
      "'Sheet1'!L2": 20,
      "'Sheet1'!M2": 'Low Stock', // fresh qty 10 < 20
      "'Sheet1'!T2": toSheetSerial(NOW),
    });
  });

  it('rule: every write carries Stock Status derived from the fresh qty and threshold (US-24)', () => {
    const writes = ready(planRowWrite(MASTER_SHEET, values, 'row-1', change({ notes: 'new' }), NOW));
    expect(writes.map((w) => w.field)).toEqual(['notes', 'stockStatus', 'lastUpdated']);
    expect(writes.find((w) => w.field === 'stockStatus')?.value).toBe(deriveStockStatus(10, 5));
  });

  describe('cell types (US-24)', () => {
    const numeric = sheetValues(sheetRow({ id: 'row-1', 'stock qty': 10, sku: 12345, packing: 10, size: 'M' }));
    const write = (changes: ProductChanges) =>
      cells(ready(planRowWrite(MASTER_SHEET, numeric, 'row-1', change(changes, {}), NOW)));

    it('rule: a text field whose cell holds a number is written back as a number', () => {
      expect(write({ sku: '54321', packing: '12' })).toMatchObject({ "'Sheet1'!F2": 54321, "'Sheet1'!J2": 12 });
    });

    it.each(['007', '1.50', '12 pcs', '-5'])('keeps %j as text (a number would change or reject it)', (typed) => {
      expect(write({ packing: typed })["'Sheet1'!J2"]).toBe(typed);
    });

    it('a text cell stays text, even for digits', () => {
      expect(write({ size: '42' })["'Sheet1'!G2"]).toBe('42');
    });
  });

  it('writes a blank number as an empty cell', () => {
    const writes = ready(planRowWrite(MASTER_SHEET, values, 'row-1', change({ mrp: null }), NOW));
    expect(writes.find((w) => w.field === 'mrp')?.value).toBe('');
  });

  it('is a conflict (nothing to write) when a reviewed value changed underneath', () => {
    const plan = planRowWrite(MASTER_SHEET, values, 'row-1', change({ stockQty: 4 }, { stockQty: 12 }), NOW);
    expect(plan.kind).toBe('conflict');
    if (plan.kind === 'conflict') {
      expect(plan.fields).toEqual(['stockQty']);
      expect(plan.current.product.stockQty).toBe(10);
    }
  });

  it.each<[string, CellValue[][], string]>([
    ['row-missing', values, 'gone'],
    ['row-duplicated', sheetValues(sheetRow({ id: 'row-1' }), sheetRow({ id: 'row-1' })), 'row-1'],
  ])('reports %s', (kind, data, id) => {
    expect(planRowWrite(MASTER_SHEET, data, id, change({ stockQty: 4 }), NOW).kind).toBe(kind);
  });

  it('throws a columns error when a required header is missing at write time', () => {
    const noMrp = values.map((row) => row.filter((_, i) => HEADER[i] !== 'mrp'));
    expect(() => planRowWrite(MASTER_SHEET, noMrp, 'row-1', change({ stockQty: 4 }), NOW)).toThrow(SheetLoadError);
  });

  it('refuses to derive Stock Status when the fresh qty is blank', () => {
    const blankQty = sheetValues(sheetRow({ id: 'row-1', 'stock qty': '' }));
    expect(() =>
      planRowWrite(MASTER_SHEET, blankQty, 'row-1', change({ lowStockThreshold: 3 }, {}), NOW),
    ).toThrow(InvalidChangeError);
  });
});
