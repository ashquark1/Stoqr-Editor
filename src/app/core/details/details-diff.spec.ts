import { mapSheet } from '@core/sheets/data-mapping';
import { DR_TRUST_SHEET, MASTER_SHEET, sheetRow, sheetValues } from '@core/sheets/testing/sheet-fixtures';
import { DetailValue, changedValues, detailRowChanges, diffLines, parseDetail, statusLines } from './details-diff';
import { DetailField, EDITABLE_DETAILS, byDetailField } from './details-fields';

describe('details diff (US-23, US-24, US-36)', () => {
  const [master] = mapSheet(
    MASTER_SHEET,
    sheetValues(sheetRow({ id: 'm1', brand: 'Dr Trust', notes: 'old', 'stock qty': 10, 'low stock threshold': 5, 'tax rate': 18 })),
  );
  // Dr Trust differs in brand and notes (both edited by hand there).
  const [drTrust] = mapSheet(
    DR_TRUST_SHEET,
    sheetValues(sheetRow({ id: 'd1', brand: 'DrTrust', notes: 'hand note', 'stock qty': 3, 'low stock threshold': 5 })),
  );
  const def = (key: DetailField) => EDITABLE_DETAILS.filter((d) => d.key === key)[0];

  /** The product's values with some fields typed over. */
  const typed = (over: Partial<Record<DetailField, DetailValue>>) =>
    byDetailField((field) => (field in over ? (over[field] ?? null) : master.product[field]));

  it('parses typed text: text as typed, numbers by value, a blank number as null', () => {
    expect(parseDetail(def('notes'), '  spaced  ')).toBe('  spaced  ');
    expect(parseDetail(def('taxRate'), ' 18.0 ')).toBe(18);
    expect(parseDetail(def('mrp'), '')).toBeNull();
  });

  it('rule: compares by value, so 18.0 for 18 is no change', () => {
    expect(changedValues(typed({ taxRate: 18 }), master.product).size).toBe(0);
    expect([...changedValues(typed({ taxRate: 12, notes: 'new' }), master.product)]).toEqual([
      ['taxRate', 12],
      ['notes', 'new'],
    ]);
  });

  it("lists each changed field old → new, with Dr Trust's old value only where it differs", () => {
    const changed = changedValues(typed({ brand: 'Dr. Trust', taxRate: 12 }), master.product);
    expect(diffLines(changed, master.product, drTrust.product)).toEqual([
      { field: 'brand', label: 'Brand', from: 'Dr Trust', to: 'Dr. Trust', drTrustFrom: 'DrTrust' },
      { field: 'taxRate', label: 'Tax Rate', from: 18, to: 12 },
    ]);
  });

  it('shows the Stock Status each sheet will get, from its OWN qty and the new threshold', () => {
    // Master qty 10, Dr Trust qty 3; threshold 5 → 20.
    const changed = changedValues(typed({ lowStockThreshold: 20 }), master.product);
    // Both store "In Stock"; Master 10 < 20 and Dr Trust 3 < 20 → Low Stock in each.
    expect(statusLines(changed, master.product, drTrust.product)).toEqual([
      { sheet: 'master', from: 'In Stock', to: 'Low Stock' },
      { sheet: 'dr-trust', from: 'In Stock', to: 'Low Stock' },
    ]);
    // Nothing listed when no sheet's status changes.
    expect(statusLines(changedValues(typed({ notes: 'x' }), master.product), master.product, null)).toEqual([]);
  });

  describe('rows to approve', () => {
    const changed = changedValues(typed({ brand: 'Dr. Trust', mrp: null }), master.product);
    const [masterRow, drTrustRow] = detailRowChanges(changed, master, drTrust);

    it('rule: only the changed fields are written, the same new values in both sheets', () => {
      expect(masterRow.changes).toEqual({ brand: 'Dr. Trust', mrp: null });
      expect(drTrustRow.changes).toEqual({ brand: 'Dr. Trust', mrp: null });
    });

    it("rule: each sheet is guarded by its OWN current values of the changed fields", () => {
      expect(masterRow).toMatchObject({ target: master.ref, reviewed: { brand: 'Dr Trust', mrp: 2999 } });
      expect(drTrustRow).toMatchObject({ target: drTrust.ref, reviewed: { brand: 'DrTrust', mrp: 2999 } });
    });

    it('rule: a field that differs between the sheets but was not edited is never written', () => {
      expect('notes' in masterRow.changes).toBe(false);
      expect('notes' in drTrustRow.changes).toBe(false);
      expect('notes' in drTrustRow.reviewed).toBe(false);
    });

    it('a master-only product is one row', () => {
      expect(detailRowChanges(changed, master, null)).toHaveLength(1);
    });
  });
});
