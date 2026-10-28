import { WritableSignal, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Auth, AuthStatus } from '@core/auth/auth';
import { LoadedProduct } from '@core/models/product';
import { CellValue, mapSheet } from '@core/sheets/data-mapping';
import { BLOCKED_SKU_REASON } from '@core/sheets/editability';
import { pairSheets } from '@core/sheets/sheet-pairing';
import { SheetsStore } from '@core/sheets/sheets-store';
import {
  DR_TRUST_SHEET,
  MASTER_SHEET,
  sheetRow,
  sheetValues,
} from '@core/sheets/testing/sheet-fixtures';
import { MAX_SHOWN, ProductSearchStore } from './product-search-store';
import { SECONDARY_ONLY_MESSAGE } from './search-validation';

type Row = Readonly<Record<string, CellValue>>;

const masterRows = (...rows: Row[]) =>
  mapSheet(MASTER_SHEET, sheetValues(...rows.map((r, i) => sheetRow({ id: `m${i}`, ...r }))));
const drTrustRows = (...rows: Row[]) =>
  mapSheet(DR_TRUST_SHEET, sheetValues(...rows.map((r, i) => sheetRow({ id: `d${i}`, ...r }))));

describe('ProductSearchStore', () => {
  let master: WritableSignal<readonly LoadedProduct[]>;
  let drTrust: WritableSignal<readonly LoadedProduct[]>;
  let status: WritableSignal<AuthStatus>;
  let sessionId: WritableSignal<number>;
  let store: ProductSearchStore;

  const names = (rows: readonly LoadedProduct[]) => rows.map((r) => r.product.productName);

  beforeEach(() => {
    master = signal(
      masterRows(
        { 'product name': 'Pulse Oximeter', brand: 'Dr Trust', sku: 'DT-PO', category: 'Devices', color: 'Blue' },
        { 'product name': 'BP Monitor', brand: 'Dr Trust', sku: 'DT-BP', category: 'Devices', status: 'Discontinued' },
        { 'product name': 'Bandage Roll', brand: 'Romsons', sku: 'RM-B1', category: 'Consumables', status: 'Inactive' },
      ),
    );
    drTrust = signal(
      drTrustRows(
        { 'product name': 'Pulse Oximeter (DT copy)', sku: 'dt-po', 'stock qty': 4 },
        { 'product name': 'Thermometer orphan', sku: 'DT-TH' },
      ),
    );
    status = signal<AuthStatus>('signed-in');
    sessionId = signal(1);
    const pairing = computed(() => pairSheets(master(), drTrust()));
    TestBed.configureTestingModule({
      providers: [
        { provide: SheetsStore, useValue: { master, drTrust, pairing } },
        { provide: Auth, useValue: { status, sessionId } },
      ],
    });
    store = TestBed.inject(ProductSearchStore);
    TestBed.tick();
  });

  describe('searching (US-12)', () => {
    it('shows nothing for an empty or blank query', () => {
      store.setQuery('   ');
      expect(store.hasQuery()).toBe(false);
      expect(store.matches()).toEqual([]);
    });

    it('matches name, brand, SKU and category, ignoring case and spacing', () => {
      store.setQuery('  OXIMETER ');
      expect(names(store.matches())).toEqual(['Pulse Oximeter']);
      store.setQuery('romsons');
      expect(names(store.matches())).toEqual(['Bandage Roll']);
      store.setQuery('dt-bp');
      expect(names(store.matches())).toEqual(['BP Monitor']);
      store.setQuery('devices');
      expect(names(store.matches())).toEqual(['Pulse Oximeter', 'BP Monitor']);
    });

    it('rule: lists master products of every status, never a Dr Trust row', () => {
      store.setQuery('dr trust');
      expect(names(store.matches())).toEqual(['Pulse Oximeter', 'BP Monitor']);
      store.setQuery('thermometer');
      expect(store.matches()).toEqual([]);
      store.setQuery('bandage');
      expect(store.matches()[0].product.status).toBe('Inactive');
    });

    it('shows V1’s message and no results for a size/colour/packing-only query', () => {
      store.setQuery('blue');
      expect(store.message()).toBe(SECONDARY_ONLY_MESSAGE);
      expect(store.matches()).toEqual([]);
      store.setQuery('oximeter blue');
      expect(store.message()).toBeNull();
      expect(names(store.matches())).toEqual(['Pulse Oximeter']);
    });

    it(`shows at most ${MAX_SHOWN} matches, with the total`, () => {
      master.set(masterRows(...Array.from({ length: 25 }, (_, i) => ({ 'product name': `Strip ${i}`, sku: `S-${i}` }))));
      store.setQuery('strip');
      expect(store.totalMatches()).toBe(25);
      expect(store.shown()).toHaveLength(MAX_SHOWN);
      expect(store.shown()[0].product.productName).toBe('Strip 0');
    });
  });

  describe('selection (US-13)', () => {
    it('selects a master row and finds its linked Dr Trust row', () => {
      store.select(master()[0].ref);
      expect(store.selected()?.product.productName).toBe('Pulse Oximeter');
      expect(store.selectedLink()?.product.productName).toBe('Pulse Oximeter (DT copy)');
      expect(store.drTrustQtyDiffers()).toBe(true);
      expect(store.selectedEditability()).toEqual({ editable: true, reasons: [] });
    });

    it('a master-only product has no link and no quantity note', () => {
      store.select(master()[2].ref);
      expect(store.selectedLink()).toBeNull();
      expect(store.drTrustQtyDiffers()).toBe(false);
      expect(store.selectedSyncBadge()).toBe('master-only');
    });

    it('rule: the quantity note and the sync badge always agree (US-37)', () => {
      store.select(master()[0].ref);
      expect(store.drTrustQtyDiffers()).toBe(true);
      expect(store.selectedSyncBadge()).toBe('out-of-sync');

      drTrust.set(drTrustRows({ 'product name': 'Pulse Oximeter (DT copy)', sku: 'dt-po', 'stock qty': 10 }));
      expect(store.drTrustQtyDiffers()).toBe(false);
      expect(store.selectedSyncBadge()).toBe('linked');
    });

    it('gives every master row a badge for the result list', () => {
      expect(master().map((row) => store.syncBadgeOf(row.ref))).toEqual([
        'out-of-sync',
        'master-only',
        'master-only',
      ]);
    });

    it('a blocked SKU is selectable but not editable, with the reason', () => {
      master.set(masterRows({ 'product name': 'A', sku: 'X' }, { 'product name': 'B', sku: 'x' }));
      store.select(master()[0].ref);
      expect(store.selectedEditability()).toEqual({ editable: false, reasons: [BLOCKED_SKU_REASON] });
    });

    it('clearSelection keeps the query', () => {
      store.setQuery('oximeter');
      store.select(master()[0].ref);
      store.clearSelection();
      expect(store.selected()).toBeNull();
      expect(store.query()).toBe('oximeter');
    });

    it('drops the selection when a reload no longer contains the row', () => {
      store.select(master()[0].ref);
      master.set(masterRows({ 'product name': 'Pulse Oximeter', sku: 'DT-PO' }));
      expect(store.selected()).toBeNull();
      expect(store.selectedEditability()).toBeNull();
    });

    it('clears the query and selection when a new session starts (sign-out or another account)', () => {
      store.setQuery('oximeter');
      store.select(master()[0].ref);
      status.set('signed-out');
      sessionId.update((id) => id + 1);
      TestBed.tick();
      expect(store.query()).toBe('');
      expect(store.selected()).toBeNull();
    });

    it('rule: expiry keeps the query and selection (US-06)', () => {
      store.setQuery('oximeter');
      store.select(master()[0].ref);
      status.set('expired');
      TestBed.tick();
      expect(store.query()).toBe('oximeter');
      expect(store.selected()?.product.productName).toBe('Pulse Oximeter');
    });
  });
});
