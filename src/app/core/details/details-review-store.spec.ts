import { WritableSignal, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Mock } from 'vitest';

import { Auth } from '@core/auth/auth';
import { AppConfig } from '@core/config/app-config';
import { SheetDefinition, SheetKey } from '@core/config/app-environment';
import { LoadedProduct, Product, ProductIssue } from '@core/models/product';
import { ProductSearchStore } from '@core/search/product-search-store';
import { ApprovedChange, approve } from '@core/sheets/approval';
import { mapSheet } from '@core/sheets/data-mapping';
import { RowRef } from '@core/sheets/row-ref';
import { pairSheets } from '@core/sheets/sheet-pairing';
import { SheetsStore } from '@core/sheets/sheets-store';
import { SheetWriteError, SheetsWriter, WriteResult } from '@core/sheets/sheets-writer';
import { DR_TRUST_SHEET, MASTER_SHEET, sheetRow, sheetValues } from '@core/sheets/testing/sheet-fixtures';
import { DetailsReviewStore } from './details-review-store';
import { DetailsStore } from './details-store';

describe('DetailsReviewStore (US-23, US-24, US-36)', () => {
  const masterRows = mapSheet(
    MASTER_SHEET,
    sheetValues(
      sheetRow({ id: 'm1', 'product name': 'Pulse Oximeter', sku: 'DT-PO', brand: 'Dr Trust', notes: 'm' }),
      sheetRow({ id: 'm2', 'product name': 'Bandage Roll', sku: 'RM-B1', brand: 'Romsons' }),
    ),
  );
  const drTrustRows = mapSheet(DR_TRUST_SHEET, sheetValues(sheetRow({ id: 'd1', sku: 'dt-po', brand: 'DrTrust', notes: 'd' })));
  const [linkedRow, masterOnlyRow] = masterRows;
  const [drTrustRow] = drTrustRows;
  const [, orphanRow] = mapSheet(
    DR_TRUST_SHEET,
    sheetValues(sheetRow({ id: 'd1' }), sheetRow({ id: 'd2', sku: 'orphan-1', 'product name': 'Orphan Gauze', 'stock qty': 6 })),
  );
  const sheetOf: Record<SheetKey, SheetDefinition> = { master: MASTER_SHEET, 'dr-trust': DR_TRUST_SHEET };

  let master: WritableSignal<readonly LoadedProduct[]>;
  let drTrust: WritableSignal<readonly LoadedProduct[]>;
  let write: Mock<(approved: ApprovedChange) => Promise<WriteResult>>;
  let search: ProductSearchStore;
  let details: DetailsStore;
  let store: DetailsReviewStore;

  function applyRow(ref: RowRef, product: Product, issues?: readonly ProductIssue[]): void {
    const replace = (rows: readonly LoadedProduct[]) =>
      rows.map((row) => (row.ref === ref ? { ref, product, issues: issues ?? row.issues } : row));
    (ref.sheet === 'master' ? master : drTrust).update(replace);
  }

  /** Google confirmed: each row as written with `changes`. */
  function written(changes: Partial<Product>, ...rows: LoadedProduct[]): WriteResult {
    return {
      kind: 'written',
      sheets: rows.map((row) => ({ sheet: sheetOf[row.ref.sheet], ref: row.ref, product: { ...row.product, ...changes }, cells: [] })),
    };
  }

  function edit(row: LoadedProduct, texts: Parameters<DetailsStore['setTexts']>[0]): void {
    search.select(row.ref);
    TestBed.tick();
    details.setTexts(texts);
  }

  beforeEach(() => {
    master = signal(masterRows);
    drTrust = signal(drTrustRows);
    write = vi.fn<(approved: ApprovedChange) => Promise<WriteResult>>();
    TestBed.configureTestingModule({
      providers: [
        { provide: SheetsStore, useValue: { master, drTrust, pairing: computed(() => pairSheets(master(), drTrust())), applyRow } },
        { provide: Auth, useValue: { status: signal('signed-in'), sessionId: signal(1) } },
        { provide: AppConfig, useValue: { sheet: (key: SheetKey) => sheetOf[key] } },
        { provide: SheetsWriter, useValue: { write } },
      ],
    });
    search = TestBed.inject(ProductSearchStore);
    details = TestBed.inject(DetailsStore);
    store = TestBed.inject(DetailsReviewStore);
  });

  it('opens only for a reviewable change, and lists the changed fields with the sheets', () => {
    search.select(linkedRow.ref);
    TestBed.tick();
    store.open();
    expect(store.step()).toBe('editing'); // nothing changed yet

    details.setTexts({ brand: 'Dr. Trust' });
    store.open();
    expect(store.step()).toBe('reviewing');
    expect(store.review()).toMatchObject({
      sheetsText: 'Master and Dr Trust',
      lines: [{ field: 'brand', from: 'Dr Trust', to: 'Dr. Trust', drTrustFrom: 'DrTrust' }],
    });
  });

  describe('SKU change (US-38)', () => {
    it('rule: a SKU used by another row cannot be reviewed or approved', async () => {
      edit(linkedRow, { sku: 'rm-b1' });
      store.open();
      expect(store.step()).toBe('editing');
      await store.approve();
      expect(write).not.toHaveBeenCalled();
    });

    it('rule: a linked product writes the new SKU to both sheets in one approval', async () => {
      write.mockResolvedValue(written({ sku: 'DT-PO-2' }, linkedRow, drTrustRow));
      edit(linkedRow, { sku: 'DT-PO-2' });
      store.open();
      await store.approve();
      expect(write.mock.calls[0][0].rows).toEqual([
        { target: linkedRow.ref, reviewed: { sku: 'DT-PO' }, changes: { sku: 'DT-PO-2' } },
        { target: drTrustRow.ref, reviewed: { sku: 'dt-po' }, changes: { sku: 'DT-PO-2' } },
      ]);
    });

    it("rule: taking an unmatched Dr Trust row's SKU links it: both rows written, with a note", async () => {
      drTrust.set([...drTrustRows, orphanRow]);
      write.mockResolvedValue(written({ sku: 'ORPHAN-1' }, masterOnlyRow, orphanRow));
      edit(masterOnlyRow, { sku: 'ORPHAN-1', brand: 'Romsons Ltd' });
      store.open();
      expect(store.review()?.sheetsText).toBe('Master and Dr Trust');
      expect(store.review()?.linkNote).toBe(
        'This links it to the Dr Trust row "Orphan Gauze" (qty 6). Later changes save to both sheets.',
      );
      await store.approve();
      expect(write.mock.calls[0][0].rows.map((r) => [r.target, r.changes])).toEqual([
        [masterOnlyRow.ref, { brand: 'Romsons Ltd', sku: 'ORPHAN-1' }],
        [orphanRow.ref, { brand: 'Romsons Ltd', sku: 'ORPHAN-1' }],
      ]);
    });
  });

  it('rule: approves ONE genuine change: only changed fields, both sheets, each guarded by its own values', async () => {
    write.mockResolvedValue(written({ brand: 'Dr. Trust' }, linkedRow, drTrustRow));
    edit(linkedRow, { brand: 'Dr. Trust' });
    store.open();
    await store.approve();

    expect(write).toHaveBeenCalledTimes(1);
    const approved = write.mock.calls[0][0];
    expect(ApprovedChange.isGenuine(approved)).toBe(true);
    expect(approved.rows).toEqual([
      { target: linkedRow.ref, reviewed: { brand: 'Dr Trust' }, changes: { brand: 'Dr. Trust' } },
      { target: drTrustRow.ref, reviewed: { brand: 'DrTrust' }, changes: { brand: 'Dr. Trust' } },
    ]);
  });

  it('success: the toast names the sheets; the product stays open showing the saved values', async () => {
    write.mockResolvedValue(written({ brand: 'Dr. Trust' }, linkedRow, drTrustRow));
    edit(linkedRow, { brand: 'Dr. Trust' });
    store.open();
    await store.approve();

    expect(store.step()).toBe('editing');
    expect(store.notice()).toBe('Pulse Oximeter: details saved (Master and Dr Trust).');
    expect(search.selected()?.ref).toBe(linkedRow.ref);
    expect(details.texts().brand).toBe('Dr. Trust');
    expect(details.hasChanges()).toBe(false);
  });

  it('a master-only product is one row', async () => {
    write.mockResolvedValue(written({ notes: 'n' }, masterOnlyRow));
    edit(masterOnlyRow, { notes: 'n' });
    store.open();
    await store.approve();
    expect(write.mock.calls[0][0].rows.map((r) => r.target)).toEqual([masterOnlyRow.ref]);
  });

  it('a double click writes once', async () => {
    let finish: (r: WriteResult) => void = () => undefined;
    write.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    edit(linkedRow, { notes: 'n' });
    store.open();
    const first = store.approve();
    await store.approve();
    finish(written({ notes: 'n' }, linkedRow, drTrustRow));
    await first;
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('conflict: nothing saved, the fresh value shown, the user’s edits kept', async () => {
    const fresh = { ...linkedRow, product: { ...linkedRow.product, brand: 'Someone else', category: 'New cat' } };
    write.mockResolvedValue({ kind: 'conflict', sheet: MASTER_SHEET, ref: linkedRow.ref, current: fresh, fields: ['brand'] });
    edit(linkedRow, { brand: 'Dr. Trust' });
    store.open();
    await store.approve();

    expect(store.step()).toBe('conflict');
    expect(store.message()).toContain('Brand changed in Master since you opened this product. Nothing was saved.');
    expect(details.texts().brand).toBe('Dr. Trust'); // the edit is kept
    expect(details.texts().category).toBe('New cat'); // an untouched field follows the fresh value
  });

  it('partial: Master saved, Dr Trust not; Retry writes only the rest of the original approval', async () => {
    const remaining = approve(
      { target: linkedRow.ref, reviewed: {}, changes: { notes: 'n' } },
      { target: drTrustRow.ref, reviewed: {}, changes: { notes: 'n' } },
    ).remaining(['master']);
    write.mockResolvedValueOnce({
      kind: 'partial',
      written: (written({ notes: 'n' }, linkedRow) as Extract<WriteResult, { kind: 'written' }>).sheets,
      error: new SheetWriteError('Dr Trust', 'access', 'No edit access to Dr Trust.'),
      remaining,
    });
    edit(linkedRow, { notes: 'n' });
    store.open();
    await store.approve();

    expect(store.step()).toBe('partial');
    expect(store.message()).toBe('Master was updated. Dr Trust was not updated: No edit access to Dr Trust.');
    expect(store.retryLabel()).toBe('Dr Trust');
    expect(details.hasChanges()).toBe(false); // Master holds the edits: nothing to save twice

    write.mockResolvedValueOnce(written({ notes: 'n' }, drTrustRow));
    await store.retry();
    expect(write.mock.calls[1][0]).toBe(remaining);
    expect(store.notice()).toBe('Pulse Oximeter: details saved (Master and Dr Trust).');
  });

  it('returns to editing when another product is selected', () => {
    edit(linkedRow, { notes: 'n' });
    store.open();
    search.select(masterOnlyRow.ref);
    TestBed.tick();
    expect(store.step()).toBe('editing');
  });
});
