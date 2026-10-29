import { ApprovedChange, InvalidChangeError, ProductChanges, RowChange, approve } from './approval';
import { mapSheet } from './data-mapping';
import { DR_TRUST_SHEET, MASTER_SHEET, sheetRow, sheetValues } from './testing/sheet-fixtures';

const [row] = mapSheet(MASTER_SHEET, sheetValues(sheetRow({ id: 'row-1' })));
const [drTrustRow] = mapSheet(DR_TRUST_SHEET, sheetValues(sheetRow({ id: 'dt-1' })));
const drTrust = (changes: ProductChanges): RowChange => ({ target: drTrustRow.ref, reviewed: {}, changes });
const change = (changes: ProductChanges): RowChange => ({ target: row.ref, reviewed: { stockQty: 10 }, changes });

describe('approve / ApprovedChange (no write without approval)', () => {
  it('seals a reviewed change as genuinely approved, frozen', () => {
    const approved = approve(change({ stockQty: 7 }));
    expect(ApprovedChange.isGenuine(approved)).toBe(true);
    expect(Object.isFrozen(approved.rows)).toBe(true);
    expect(Object.isFrozen(approved.rows[0].changes)).toBe(true);
    expect(approved.rows[0].changes).toEqual({ stockQty: 7 });
  });

  it('one approval covers a linked product: one Master row, then one Dr Trust row', () => {
    const approved = approve(change({ stockQty: 7 }), drTrust({ stockQty: 7 }));
    expect(approved.rows.map((r) => r.target.sheet)).toEqual(['master', 'dr-trust']);
  });

  it.each([
    ['no rows', () => approve()],
    ['three rows', () => approve(change({ stockQty: 7 }), drTrust({ stockQty: 7 }), drTrust({ stockQty: 7 }))],
    ['Dr Trust first', () => approve(drTrust({ stockQty: 7 }), change({ stockQty: 7 }))],
    ['two Master rows', () => approve(change({ stockQty: 7 }), change({ stockQty: 7 }))],
  ])('refuses %s', (_case, build) => {
    expect(build).toThrow(InvalidChangeError);
  });

  it('checks every row: a bad Dr Trust row refuses the whole approval', () => {
    expect(() => approve(change({ stockQty: 7 }), drTrust({ stockQty: -1 }))).toThrow(InvalidChangeError);
  });

  describe('rule: an approval cannot be forged', () => {
    it('rejects a hand-built object of the same shape', () => {
      const lookalike = { rows: [change({ stockQty: 7 })] };
      expect(ApprovedChange.isGenuine(lookalike)).toBe(false);
    });

    it('rejects an object pretending to be an ApprovedChange', () => {
      const pretender: unknown = Object.create(ApprovedChange.prototype);
      expect(ApprovedChange.isGenuine(pretender)).toBe(false);
    });

    it('the constructor refuses any key but the module-private one', () => {
      // A lookalike symbol with the same description is still not the key.
      expect(() => Reflect.construct(ApprovedChange, [[change({ stockQty: 7 })], Symbol('approval')])).toThrow(
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

  describe('remaining() (Retry after a partial write, US-34)', () => {
    const linked = () => approve(change({ stockQty: 7 }), drTrust({ stockQty: 7 }));

    it('keeps only the unwritten rows, unchanged, as a genuine approval', () => {
      const original = linked();
      const rest = original.remaining(['master']);
      expect(ApprovedChange.isGenuine(rest)).toBe(true);
      expect(rest.rows).toEqual([original.rows[1]]);
      expect(Object.isFrozen(rest.rows)).toBe(true);
    });

    it('refuses an empty result', () => {
      expect(() => linked().remaining(['master', 'dr-trust'])).toThrow(InvalidChangeError);
    });

    it('rule: a forged approval cannot be turned into a genuine one', () => {
      const pretender = Object.create(ApprovedChange.prototype) as ApprovedChange;
      expect(() => pretender.remaining([])).toThrow(InvalidChangeError);
    });
  });
});
