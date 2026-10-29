import { mapSheet } from './data-mapping';
import { SKU_SPACES_MESSAGE, checkNewSku, freshSkuHolder } from './sku-check';
import { DR_TRUST_SHEET, MASTER_SHEET, sheetRow, sheetValues } from './testing/sheet-fixtures';

describe('SKU check (US-38)', () => {
  const master = mapSheet(
    MASTER_SHEET,
    sheetValues(
      sheetRow({ id: 'm1', sku: 'DT-PO', 'product name': 'Pulse Oximeter' }),
      sheetRow({ id: 'm2', sku: 'RM-B1', 'product name': 'Bandage Roll' }),
    ),
  );
  const drTrust = mapSheet(
    DR_TRUST_SHEET,
    sheetValues(
      sheetRow({ id: 'd1', sku: 'dt-po', 'product name': 'Pulse Oximeter' }),
      sheetRow({ id: 'd2', sku: 'ORPHAN-1', 'product name': 'Gauze' }),
      sheetRow({ id: 'd3', sku: 'twin', 'product name': 'Twin A' }),
      sheetRow({ id: 'd4', sku: 'TWIN', 'product name': 'Twin B' }),
    ),
  );
  const [linked, masterOnly] = master;
  const [linkedDr, orphan] = drTrust;
  const labels = { master: 'Master', drTrust: 'Dr Trust' };
  const asLinked = (sku: string) => checkNewSku(sku, { master: linked, drTrust: linkedDr }, master, drTrust, labels);
  const asMasterOnly = (sku: string) => checkNewSku(sku, { master: masterOnly, drTrust: null }, master, drTrust, labels);

  it('refuses spaces at either end (never trims)', () => {
    expect(asLinked(' DT-1')).toEqual({ ok: false, message: SKU_SPACES_MESSAGE });
    expect(asLinked('DT-1 ')).toEqual({ ok: false, message: SKU_SPACES_MESSAGE });
  });

  it("allows an unused SKU, and a case-only change of the product's own SKU", () => {
    expect(asLinked('DT-PO-2')).toEqual({ ok: true, linkTo: null });
    expect(asLinked('dt-po')).toEqual({ ok: true, linkTo: null });
  });

  it('rule: refuses a SKU on another Master row, normalised, naming the row', () => {
    expect(asLinked('rm-b1')).toEqual({ ok: false, message: 'SKU rm-b1 is already used in Master (Bandage Roll).' });
  });

  it("rule: a linked product may not take a Dr Trust row's SKU (its own Dr Trust row would share it)", () => {
    expect(asLinked('orphan-1')).toEqual({ ok: false, message: 'SKU orphan-1 is already used in Dr Trust (Gauze).' });
  });

  it("owner choice: a master-only product taking ONE unmatched Dr Trust row's SKU links to it", () => {
    expect(asMasterOnly('orphan-1')).toEqual({ ok: true, linkTo: orphan });
  });

  it('refuses a SKU held by more than one Dr Trust row', () => {
    expect(asMasterOnly('Twin')).toEqual({ ok: false, message: 'SKU Twin is used by more than one row in Dr Trust.' });
  });

  it("refuses a master-only product taking a linked product's SKU (it is on a Master row)", () => {
    expect(asMasterOnly('DT-PO')).toEqual({
      ok: false,
      message: 'SKU DT-PO is already used in Master (Pulse Oximeter).',
    });
  });

  describe('freshSkuHolder (save-time re-check)', () => {
    const fresh = sheetValues(sheetRow({ id: 'd1', sku: 'NEW-1', 'product name': 'Mine' }), sheetRow({ id: 'd9', sku: 'x' }));

    it('ignores the approval’s own rows', () => {
      expect(freshSkuHolder(DR_TRUST_SHEET, fresh, 'new-1', [linkedDr.ref])).toBeNull();
    });

    it('rule: names another row now holding the SKU', () => {
      expect(freshSkuHolder(DR_TRUST_SHEET, fresh, 'NEW-1', [linked.ref])).toBe('Mine');
    });
  });
});
