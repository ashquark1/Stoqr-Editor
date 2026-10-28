import { CellValue, mapSheet } from './data-mapping';
import { pairSheets, syncStatuses } from './sheet-pairing';
import { linkedQtyDiffers, syncBadges } from './sync-badge';
import { DR_TRUST_SHEET, MASTER_SHEET, sheetRow, sheetValues } from './testing/sheet-fixtures';

type Spec = readonly [name: string, sku: CellValue, qty: CellValue];

function pair(master: readonly Spec[], drTrust: readonly Spec[]) {
  const load = (sheet: typeof MASTER_SHEET, specs: readonly Spec[]) =>
    mapSheet(
      sheet,
      sheetValues(...specs.map(([name, sku, qty], i) => sheetRow({ id: `${sheet.key}-${i}`, 'product name': name, sku, 'stock qty': qty }))),
    );
  const masterRows = load(MASTER_SHEET, master);
  const result = pairSheets(masterRows, load(DR_TRUST_SHEET, drTrust));
  const badges = syncBadges(result);
  return {
    result,
    badges,
    byName: Object.fromEntries(masterRows.map((row) => [row.product.productName, badges.get(row.ref)])),
  };
}

describe('syncBadges (US-37)', () => {
  it('shows each of the four kinds', () => {
    const { byName } = pair(
      [
        ['same', 'A', 10],
        ['differs', 'B', 10],
        ['alone', 'C', 10],
        ['dup', 'D', 10],
      ],
      [
        ['same-dt', 'a', 10],
        ['differs-dt', 'B', 7],
        ['dup-1', 'D', 10],
        ['dup-2', 'd', 10],
      ],
    );
    expect(byName).toEqual({ same: 'linked', differs: 'out-of-sync', alone: 'master-only', dup: 'blocked' });
  });

  it('treats blank quantities as values: both blank is in sync, one blank is not', () => {
    const { byName } = pair(
      [
        ['both-blank', 'A', ''],
        ['one-blank', 'B', 5],
      ],
      [
        ['a', 'A', ''],
        ['b', 'B', ''],
      ],
    );
    expect(byName).toEqual({ 'both-blank': 'linked', 'one-blank': 'out-of-sync' });
  });

  describe('rules', () => {
    const mixed = pair(
      [
        ['linked', 'L', 1],
        ['drift', 'O', 1],
        ['only', 'M', 1],
        ['blocked-a', 'X', 1],
        ['blocked-b', 'x', 2],
        ['no-sku', '', 3],
      ],
      [
        ['l', 'L', 1],
        ['o', 'O', 9],
        ['x-dt', 'X', 5],
      ],
    );

    it('a blocked row is never shown as linked or out of sync', () => {
      expect(mixed.byName['blocked-a']).toBe('blocked');
      expect(mixed.byName['blocked-b']).toBe('blocked');
    });

    it('out of sync only ever applies to a linked pair', () => {
      const statuses = syncStatuses(mixed.result);
      for (const [ref, badge] of mixed.badges) {
        if (badge === 'out-of-sync') {
          expect(statuses.get(ref)).toBe('linked');
        }
      }
      expect(mixed.result.linked.filter(linkedQtyDiffers).map((p) => p.master.product.productName)).toEqual(['drift']);
    });

    it('gives every master row exactly one badge', () => {
      expect(Object.keys(mixed.byName)).toHaveLength(6);
      expect(Object.values(mixed.byName).every((badge) => badge !== undefined)).toBe(true);
      expect(mixed.badges.size).toBe(6);
    });
  });
});
