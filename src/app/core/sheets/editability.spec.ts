import { mapSheet } from './data-mapping';
import { BLOCKED_SKU_REASON, editability } from './editability';
import { MASTER_SHEET, sheetRow, sheetValues } from './testing/sheet-fixtures';

describe('editability (one rule for adjust and edit)', () => {
  const [clean, missingId, badQty] = mapSheet(
    MASTER_SHEET,
    sheetValues(sheetRow({ id: 'a' }), sheetRow({ id: '' }), sheetRow({ id: 'c', 'stock qty': -1 })),
  );

  it.each([['linked'], ['master-only']] as const)('a clean %s row is editable', (status) => {
    expect(editability(clean, status)).toEqual({ editable: true, reasons: [] });
  });

  it('rule: a blocked SKU is never editable', () => {
    expect(editability(clean, 'blocked')).toEqual({ editable: false, reasons: [BLOCKED_SKU_REASON] });
  });

  it('rule: a row with an issue is never editable, even when linked', () => {
    expect(editability(missingId, 'linked')).toEqual({
      editable: false,
      reasons: ['Not editable: missing id'],
    });
  });

  it('lists every reason, issues first', () => {
    expect(editability(badQty, 'blocked').reasons).toEqual([
      'Not editable: stock qty is not a whole number ≥ 0',
      BLOCKED_SKU_REASON,
    ]);
  });
});
