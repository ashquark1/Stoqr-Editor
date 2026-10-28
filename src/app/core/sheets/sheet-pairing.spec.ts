import { SheetDefinition } from '@core/config/app-environment';
import { LoadedProduct } from '@core/models/product';
import { CellValue, mapSheet } from './data-mapping';
import {
  PairingResult,
  hasSku,
  normalizeSku,
  pairSheets,
  pairingCounts,
  syncStatuses,
} from './sheet-pairing';
import { DR_TRUST_SHEET, MASTER_SHEET, sheetRow, sheetValues } from './testing/sheet-fixtures';

interface RowSpec {
  readonly name: string;
  readonly sku: CellValue;
  readonly id?: string;
  readonly qty?: CellValue;
}

/** Loads rows through the real mapper, so pairing sees exactly what the app sees. */
function load(sheet: SheetDefinition, specs: readonly RowSpec[]): LoadedProduct[] {
  return mapSheet(
    sheet,
    sheetValues(
      ...specs.map((s, i) =>
        sheetRow({
          id: s.id ?? `${sheet.key}-${i}`,
          sku: s.sku,
          'product name': s.name,
          'stock qty': s.qty ?? 10,
        }),
      ),
    ),
  );
}

const name = (p: LoadedProduct) => p.product.productName;

/** Result by product name, independent of ids and refs. */
function summary(result: PairingResult) {
  return {
    linked: result.linked.map((pair) => [name(pair.master), name(pair.drTrust)]),
    masterOnly: result.masterOnly.map(name),
    blocked: result.blocked.map((g) => ({ sku: g.sku, rows: g.rows.map((r) => `${r.sheet}:${name(r.product)}`) })),
    orphans: result.orphans.map(name),
  };
}

/** Same as summary, but each bucket sorted: for order-independence checks. */
function sortedSummary(result: PairingResult) {
  const s = summary(result);
  const sort = <T>(items: T[]) => [...items].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    linked: sort(s.linked),
    masterOnly: sort(s.masterOnly),
    blocked: sort(s.blocked.map((g) => ({ sku: g.sku, rows: sort(g.rows) }))),
    orphans: sort(s.orphans),
  };
}

/** A mix covering every bucket: linked, master-only, blocked both ways, orphans, blank SKUs. */
const MIXED_MASTER: RowSpec[] = [
  { name: 'm-linked', sku: 'L-1' },
  { name: 'm-only', sku: 'M-1' },
  { name: 'm-dup-a', sku: 'D-M' },
  { name: 'm-dup-b', sku: 'd-m ' },
  { name: 'm-vs-dt-dup', sku: 'D-T' },
  { name: 'm-no-sku', sku: '' },
];
const MIXED_DR_TRUST: RowSpec[] = [
  { name: 't-linked', sku: ' l-1' },
  { name: 't-of-m-dup', sku: 'D-M' },
  { name: 't-dup-a', sku: 'D-T' },
  { name: 't-dup-b', sku: 'D-T' },
  { name: 't-orphan', sku: 'T-1' },
  { name: 't-no-sku', sku: '' },
];

describe('pairSheets', () => {
  describe('rules', () => {
    it('is independent of id values', () => {
      const withIds = (specs: RowSpec[], prefix: string) =>
        specs.map((s, i) => ({ ...s, id: `${prefix}-${i * 7 + 3}` }));
      const a = pairSheets(load(MASTER_SHEET, withIds(MIXED_MASTER, 'a')), load(DR_TRUST_SHEET, withIds(MIXED_DR_TRUST, 'b')));
      const b = pairSheets(load(MASTER_SHEET, withIds(MIXED_MASTER, 'zz')), load(DR_TRUST_SHEET, withIds(MIXED_DR_TRUST, 'q')));
      expect(summary(b)).toEqual(summary(a));
    });

    it('is independent of row order within each sheet', () => {
      const straight = pairSheets(load(MASTER_SHEET, MIXED_MASTER), load(DR_TRUST_SHEET, MIXED_DR_TRUST));
      const shuffled = pairSheets(
        load(MASTER_SHEET, [...MIXED_MASTER].reverse()),
        load(DR_TRUST_SHEET, [MIXED_DR_TRUST[3], MIXED_DR_TRUST[0], MIXED_DR_TRUST[5], MIXED_DR_TRUST[1], MIXED_DR_TRUST[4], MIXED_DR_TRUST[2]]),
      );
      expect(sortedSummary(shuffled)).toEqual(sortedSummary(straight));
    });

    it('puts every input row in exactly one bucket', () => {
      const master = load(MASTER_SHEET, MIXED_MASTER);
      const drTrust = load(DR_TRUST_SHEET, MIXED_DR_TRUST);
      const result = pairSheets(master, drTrust);
      const placed = [
        ...result.linked.flatMap((pair) => [pair.master, pair.drTrust]),
        ...result.masterOnly,
        ...result.blocked.flatMap((group) => group.rows.map((row) => row.product)),
        ...result.orphans,
      ];
      expect(placed).toHaveLength(master.length + drTrust.length);
      expect(new Set(placed)).toEqual(new Set([...master, ...drTrust]));
    });

    it('never links a SKU that is duplicated in either sheet', () => {
      const result = pairSheets(load(MASTER_SHEET, MIXED_MASTER), load(DR_TRUST_SHEET, MIXED_DR_TRUST));
      const blockedSkus = new Set(result.blocked.map((g) => g.sku));
      for (const pair of result.linked) {
        expect(blockedSkus.has(normalizeSku(pair.master.product.sku))).toBe(false);
      }
      expect(summary(result).linked).toEqual([['m-linked', 't-linked']]);
    });

    it('does not mutate its inputs', () => {
      const master = load(MASTER_SHEET, MIXED_MASTER);
      const drTrust = load(DR_TRUST_SHEET, MIXED_DR_TRUST);
      const before = JSON.stringify([master, drTrust]);
      const order = [...master, ...drTrust];
      pairSheets(master, drTrust);
      expect(JSON.stringify([master, drTrust])).toBe(before);
      expect([...master, ...drTrust]).toEqual(order);
    });
  });

  describe('edge cases (specs/sku-pairing.md)', () => {
    it('links "ABC-1" with " abc-1 " (trimmed, case-insensitive)', () => {
      const result = pairSheets(load(MASTER_SHEET, [{ name: 'm', sku: 'ABC-1' }]), load(DR_TRUST_SHEET, [{ name: 't', sku: ' abc-1 ' }]));
      expect(summary(result).linked).toEqual([['m', 't']]);
    });

    it('does not link numeric 123 with text "00123"', () => {
      const result = pairSheets(load(MASTER_SHEET, [{ name: 'm', sku: 123 }]), load(DR_TRUST_SHEET, [{ name: 't', sku: '00123' }]));
      expect(summary(result)).toEqual({ linked: [], masterOnly: ['m'], blocked: [], orphans: ['t'] });
    });

    it('a SKU twice in Dr Trust only blocks the master row and both Dr Trust rows', () => {
      const result = pairSheets(
        load(MASTER_SHEET, [{ name: 'm', sku: 'X' }]),
        load(DR_TRUST_SHEET, [{ name: 't1', sku: 'X' }, { name: 't2', sku: 'x' }]),
      );
      expect(summary(result)).toEqual({
        linked: [],
        masterOnly: [],
        blocked: [{ sku: 'x', rows: ['master:m', 'dr-trust:t1', 'dr-trust:t2'] }],
        orphans: [],
      });
    });

    it('a SKU twice in master only blocks both master rows and the Dr Trust row (not an orphan)', () => {
      const result = pairSheets(
        load(MASTER_SHEET, [{ name: 'm1', sku: 'Y' }, { name: 'm2', sku: 'Y' }]),
        load(DR_TRUST_SHEET, [{ name: 't', sku: 'Y' }]),
      );
      expect(summary(result).blocked).toEqual([{ sku: 'y', rows: ['master:m1', 'master:m2', 'dr-trust:t'] }]);
      expect(result.orphans).toEqual([]);
    });

    it('treats case-only duplicates ("ABC", "abc") in one sheet as duplicates', () => {
      const result = pairSheets(load(MASTER_SHEET, [{ name: 'm1', sku: 'ABC' }, { name: 'm2', sku: 'abc' }]), []);
      expect(summary(result).blocked).toEqual([{ sku: 'abc', rows: ['master:m1', 'master:m2'] }]);
    });

    it('returns an empty result when both sheets are empty', () => {
      expect(pairSheets([], [])).toEqual({ linked: [], masterOnly: [], blocked: [], orphans: [] });
    });
  });

  describe('blank SKUs', () => {
    it('master rows without a SKU are master-only (never blocked); Dr Trust ones are orphans', () => {
      const master = load(MASTER_SHEET, [{ name: 'm1', sku: '' }, { name: 'm2', sku: '  ' }]);
      const result = pairSheets(master, load(DR_TRUST_SHEET, [{ name: 't1', sku: '' }, { name: 't2', sku: '' }]));
      expect(summary(result)).toEqual({ linked: [], masterOnly: ['m1', 'm2'], blocked: [], orphans: ['t1', 't2'] });
      expect(master.map(hasSku)).toEqual([false, false]);
    });
  });

  it('keeps loader issues on linked rows (pairing does not make a flagged row editable)', () => {
    const result = pairSheets(
      load(MASTER_SHEET, [{ name: 'm', sku: 'Q', qty: -5 }]),
      load(DR_TRUST_SHEET, [{ name: 't', sku: 'Q' }]),
    );
    expect(result.linked[0].master.issues).toEqual(['invalid-quantity']);
  });
});

describe('syncStatuses and pairingCounts', () => {
  const master = load(MASTER_SHEET, MIXED_MASTER);
  const result = pairSheets(master, load(DR_TRUST_SHEET, MIXED_DR_TRUST));

  it('gives every master row its status, keyed by RowRef', () => {
    const statuses = syncStatuses(result);
    expect(master.map((row) => [name(row), statuses.get(row.ref)])).toEqual([
      ['m-linked', 'linked'],
      ['m-only', 'master-only'],
      ['m-dup-a', 'blocked'],
      ['m-dup-b', 'blocked'],
      ['m-vs-dt-dup', 'blocked'],
      ['m-no-sku', 'master-only'],
    ]);
    expect(statuses.size).toBe(master.length);
  });

  it('counts each bucket, with blocked as SKUs and rows', () => {
    expect(pairingCounts(result)).toEqual({
      linked: 1,
      masterOnly: 2,
      blockedSkus: 2,
      blockedRows: 6,
      unmatchedDrTrust: 2,
    });
  });
});
