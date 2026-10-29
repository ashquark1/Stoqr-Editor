import { WritableSignal, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Mock } from 'vitest';

import { Auth } from '@core/auth/auth';
import { AppConfig } from '@core/config/app-config';
import { SheetDefinition, SheetKey } from '@core/config/app-environment';
import { LoadedProduct, Product, ProductIssue } from '@core/models/product';
import { ProductSearchStore } from '@core/search/product-search-store';
import { ApprovedChange } from '@core/sheets/approval';
import { mapSheet } from '@core/sheets/data-mapping';
import { RowRef } from '@core/sheets/row-ref';
import { pairSheets } from '@core/sheets/sheet-pairing';
import { SheetsStore } from '@core/sheets/sheets-store';
import { SheetWriteError, SheetsWriter, WriteResult } from '@core/sheets/sheets-writer';
import { DR_TRUST_SHEET, MASTER_SHEET, sheetRow, sheetValues } from '@core/sheets/testing/sheet-fixtures';
import { StockAdjustStore } from './stock-adjust-store';
import { StockReviewStore } from './stock-review-store';

describe('StockReviewStore', () => {
  const masterRows = mapSheet(
    MASTER_SHEET,
    sheetValues(
      sheetRow({ id: 'm1', 'product name': 'Pulse Oximeter', sku: 'DT-PO', 'stock qty': 10, 'low stock threshold': 5 }),
      sheetRow({ id: 'm2', 'product name': 'Bandage Roll', sku: 'RM-B1', 'stock qty': 20, 'low stock threshold': 5 }),
      sheetRow({ id: 'm3', 'product name': 'Broken', sku: 'X-1', 'stock qty': -1 }),
    ),
  );
  const drTrustRows = mapSheet(DR_TRUST_SHEET, sheetValues(sheetRow({ id: 'd1', sku: 'dt-po', 'stock qty': 4 })));
  const [linkedRow, masterOnlyRow, brokenRow] = masterRows;
  const [drTrustRow] = drTrustRows;

  let master: WritableSignal<readonly LoadedProduct[]>;
  let drTrust: WritableSignal<readonly LoadedProduct[]>;
  let write: Mock<(approved: ApprovedChange) => Promise<WriteResult>>;
  let search: ProductSearchStore;
  let adjust: StockAdjustStore;
  let store: StockReviewStore;

  const sheetOf: Record<SheetKey, SheetDefinition> = { master: MASTER_SHEET, 'dr-trust': DR_TRUST_SHEET };

  /** Same replacement the real store does. */
  function applyRow(ref: RowRef, product: Product, issues?: readonly ProductIssue[]): void {
    const replace = (rows: readonly LoadedProduct[]) =>
      rows.map((row) => (row.ref === ref ? { ref, product, issues: issues ?? row.issues } : row));
    (ref.sheet === 'master' ? master : drTrust).update(replace);
  }

  function written(...rows: LoadedProduct[]): WriteResult {
    return {
      kind: 'written',
      sheets: rows.map((row) => ({
        sheet: sheetOf[row.ref.sheet],
        ref: row.ref,
        product: { ...row.product, stockQty: 7, stockStatus: 'In Stock' },
        cells: [],
      })),
    };
  }

  /** Pick a product and enter "subtract 3" (10 → 7 for the linked one). */
  function prepare(row: LoadedProduct, amount = '3'): void {
    search.select(row.ref);
    TestBed.tick();
    adjust.setMode('subtract');
    adjust.setAmount(amount);
  }

  beforeEach(() => {
    master = signal(masterRows);
    drTrust = signal(drTrustRows);
    write = vi.fn<(approved: ApprovedChange) => Promise<WriteResult>>(() => Promise.resolve(written(linkedRow)));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SheetsStore,
          useValue: { master, drTrust, pairing: computed(() => pairSheets(master(), drTrust())), applyRow },
        },
        { provide: Auth, useValue: { status: signal('signed-in'), sessionId: signal(1) } },
        { provide: AppConfig, useValue: { sheet: (key: SheetKey) => sheetOf[key] } },
        { provide: SheetsWriter, useValue: { write } },
      ],
    });
    search = TestBed.inject(ProductSearchStore);
    adjust = TestBed.inject(StockAdjustStore);
    store = TestBed.inject(StockReviewStore);
    TestBed.tick();
  });

  it('opens only for a valid proposal', () => {
    search.select(linkedRow.ref);
    TestBed.tick();
    store.open();
    expect(store.step()).toBe('editing');
    adjust.setMode('subtract');
    adjust.setAmount('11'); // below zero: blocked
    store.open();
    expect(store.step()).toBe('editing');
    adjust.setAmount('3');
    store.open();
    expect(store.step()).toBe('reviewing');
  });

  it('summarises a linked change, with the Dr Trust note when the quantities differ', () => {
    prepare(linkedRow);
    expect(store.review()).toEqual({
      productName: 'Pulse Oximeter',
      sheetsText: 'Master and Dr Trust',
      current: 10,
      deltaText: '−3',
      proposed: 7,
      status: 'In Stock',
      lowStockWarning: false,
      drTrustNote: 'Dr Trust currently has 4; it will be set to 7.',
    });
  });

  it('a master-only product saves to Master only, with no note', () => {
    prepare(masterOnlyRow);
    expect(store.review()?.sheetsText).toBe('Master');
    expect(store.review()?.drTrustNote).toBeNull();
  });

  it('rule: one approval covers both rows — Master guarded by the reviewed qty, Dr Trust set to the same absolute qty', async () => {
    write.mockResolvedValue(written(linkedRow, drTrustRow));
    prepare(linkedRow);
    store.open();
    await store.approve();

    expect(write).toHaveBeenCalledTimes(1);
    const approved = write.mock.calls[0][0];
    expect(ApprovedChange.isGenuine(approved)).toBe(true);
    expect(approved.rows).toEqual([
      { target: linkedRow.ref, reviewed: { stockQty: 10 }, changes: { stockQty: 7 } },
      { target: drTrustRow.ref, reviewed: {}, changes: { stockQty: 7 } },
    ]);
  });

  it('a master-only approval has one row', async () => {
    write.mockResolvedValue(written(masterOnlyRow));
    prepare(masterOnlyRow);
    store.open();
    await store.approve();
    expect(write.mock.calls[0][0].rows.map((r) => r.target)).toEqual([masterOnlyRow.ref]);
  });

  it('rule: nothing is written without the review step', async () => {
    prepare(linkedRow);
    await store.approve(); // still editing
    expect(write).not.toHaveBeenCalled();
  });

  it('a double approve writes once', async () => {
    prepare(linkedRow);
    store.open();
    const first = store.approve();
    expect(store.step()).toBe('saving');
    await store.approve();
    await first;
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('cannot go back while saving', async () => {
    prepare(linkedRow);
    store.open();
    const pending = store.approve();
    store.back();
    expect(store.step()).toBe('saving');
    await pending;
  });

  it('refuses a product that is not editable', async () => {
    search.select(brokenRow.ref);
    TestBed.tick();
    expect(search.selectedEditability()?.editable).toBe(false);
    adjust.setMode('add');
    adjust.setAmount('1');
    store.open();
    await store.approve();
    expect(write).not.toHaveBeenCalled();
  });

  it('on success: applies the confirmed values, shows a notice, resets and clears the selection', async () => {
    write.mockResolvedValue(written(linkedRow, drTrustRow));
    prepare(linkedRow);
    store.open();
    await store.approve();
    TestBed.tick();

    expect(master()[0].product.stockQty).toBe(7);
    expect(drTrust()[0].product.stockQty).toBe(7);
    expect(store.notice()).toBe('Pulse Oximeter is now 7 (Master and Dr Trust).');
    expect(store.step()).toBe('editing');
    expect(search.selected()).toBeNull();
    expect(adjust.amountText()).toBe('');

    store.clearNotice();
    expect(store.notice()).toBeNull();
  });

  it('on conflict: shows the fresh qty, keeps the selection, and a fresh review uses it', async () => {
    write.mockResolvedValue({
      kind: 'conflict',
      sheet: MASTER_SHEET,
      ref: linkedRow.ref,
      current: { ...linkedRow, product: { ...linkedRow.product, stockQty: 12 } },
      fields: ['stockQty'],
    });
    prepare(linkedRow);
    store.open();
    await store.approve();

    expect(store.step()).toBe('conflict');
    expect(store.message()).toBe('The stock changed to 12 since you reviewed. Nothing was saved.');
    expect(search.selected()?.product.stockQty).toBe(12);
    store.open();
    expect(store.step()).toBe('reviewing');
    expect(store.review()?.current).toBe(12);
    expect(store.review()?.proposed).toBe(9);
  });

  it('rule: a partial write is never success — names both sheets and clears the amount', async () => {
    const [masterWritten] = (written(linkedRow) as Extract<WriteResult, { kind: 'written' }>).sheets;
    write.mockResolvedValue({
      kind: 'partial',
      written: [masterWritten],
      error: new SheetWriteError('Dr Trust', 'access', "You don't have edit access to Dr Trust."),
    });
    prepare(linkedRow);
    store.open();
    await store.approve();

    expect(store.step()).toBe('partial');
    expect(store.notice()).toBeNull();
    expect(store.message()).toBe(
      "Master was updated to 7. Dr Trust was not updated: You don't have edit access to Dr Trust.",
    );
    expect(master()[0].product.stockQty).toBe(7);
    expect(drTrust()[0].product.stockQty).toBe(4);
    expect(adjust.amountText()).toBe('');
  });

  it('on failure: shows the message and allows another try', async () => {
    write.mockResolvedValueOnce({
      kind: 'failed',
      error: new SheetWriteError('Master', 'unavailable', "Couldn't save to Master."),
    });
    prepare(linkedRow);
    store.open();
    await store.approve();
    expect(store.step()).toBe('failed');
    expect(store.message()).toBe("Couldn't save to Master.");
    expect(store.notice()).toBeNull();

    await store.approve();
    expect(write).toHaveBeenCalledTimes(2);
    expect(store.step()).toBe('editing');
  });

  it('choosing another product returns to editing', () => {
    prepare(linkedRow);
    store.open();
    search.select(masterOnlyRow.ref);
    TestBed.tick();
    expect(store.step()).toBe('editing');
  });
});
