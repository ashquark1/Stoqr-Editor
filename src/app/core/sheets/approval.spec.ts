import { ApprovedChange, InvalidChangeError, ProductChanges, RowChange, approve } from './approval';
import { mapSheet } from './data-mapping';
import { MASTER_SHEET, sheetRow, sheetValues } from './testing/sheet-fixtures';

const [row] = mapSheet(MASTER_SHEET, sheetValues(sheetRow({ id: 'row-1' })));
const change = (changes: ProductChanges): RowChange => ({ target: row.ref, reviewed: { stockQty: 10 }, changes });

describe('approve / ApprovedChange (no write without approval)', () => {
  it('seals a reviewed change as genuinely approved, frozen', () => {
    const approved = approve(change({ stockQty: 7 }));
    expect(ApprovedChange.isGenuine(approved)).toBe(true);
    expect(Object.isFrozen(approved.change.changes)).toBe(true);
    expect(approved.change.changes).toEqual({ stockQty: 7 });
  });

  describe('rule: an approval cannot be forged', () => {
    it('rejects a hand-built object of the same shape', () => {
      const lookalike = { change: change({ stockQty: 7 }) };
      expect(ApprovedChange.isGenuine(lookalike)).toBe(false);
    });

    it('rejects an object pretending to be an ApprovedChange', () => {
      const pretender: unknown = Object.create(ApprovedChange.prototype);
      expect(ApprovedChange.isGenuine(pretender)).toBe(false);
    });

    it('the constructor refuses any key but the module-private one', () => {
      // A lookalike symbol with the same description is still not the key.
      expect(() => Reflect.construct(ApprovedChange, [change({ stockQty: 7 }), Symbol('approval')])).toThrow(
        'An ApprovedChange can only be created by approve().',
      );
    });
  });

  it.each([
    ['an empty change', {}],
    ['a negative qty', { stockQty: -1 }],
    ['a decimal qty', { stockQty: 2.5 }],
    ['a blank qty', { stockQty: null }],
    ['a negative threshold', { lowStockThreshold: -3 }],
  ] as const)('refuses %s', (_case, changes) => {
    expect(() => approve(change(changes))).toThrow(InvalidChangeError);
  });

  it('rule: refuses id, Created At, Stock Status or Last Updated even through a cast', () => {
    for (const field of ['id', 'createdAt', 'stockStatus', 'lastUpdated']) {
      const sneaky: unknown = { [field]: 'x' };
      expect(() => approve(change(sneaky as ProductChanges))).toThrow(InvalidChangeError);
    }
  });

  it('accepts a blank threshold (clearing it is allowed)', () => {
    expect(() => approve(change({ lowStockThreshold: null }))).not.toThrow();
  });
});
