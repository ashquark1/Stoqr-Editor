import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Mock } from 'vitest';

import { Auth, AuthStatus } from '@core/auth/auth';
import { SheetDefinition } from '@core/config/app-environment';
import { CellValue } from './data-mapping';
import { SheetLoadError } from './sheet-load-error';
import { SheetsReader } from './sheets-reader';
import { SheetsStore } from './sheets-store';
import { HEADER, sheetRow, sheetValues } from './testing/sheet-fixtures';

type Read = (sheet: SheetDefinition) => Promise<CellValue[][] | undefined>;

describe('SheetsStore', () => {
  let status: WritableSignal<AuthStatus>;
  let read: Mock<Read>;
  let store: SheetsStore;

  const masterRows = sheetValues(sheetRow({ id: 'm1' }), sheetRow({ id: 'm2', 'stock qty': -1 }));
  const drTrustRows = sheetValues(sheetRow({ id: 'd1' }));

  function respond(byKey: Partial<Record<SheetDefinition['key'], () => Promise<CellValue[][] | undefined>>>): void {
    read.mockImplementation((sheet) => byKey[sheet.key]?.() ?? Promise.resolve(undefined));
  }

  beforeEach(() => {
    status = signal<AuthStatus>('signed-in');
    read = vi.fn<Read>();
    TestBed.configureTestingModule({
      providers: [
        { provide: SheetsReader, useValue: { read } },
        { provide: Auth, useValue: { status } },
      ],
    });
    store = TestBed.inject(SheetsStore);
    TestBed.tick();
  });

  it('loads both sheets and counts flagged rows', async () => {
    respond({ master: async () => masterRows, 'dr-trust': async () => drTrustRows });
    await store.ensureLoaded();

    expect(read.mock.calls.map(([sheet]) => sheet.key)).toEqual(['master', 'dr-trust']);
    expect(store.master()).toHaveLength(2);
    expect(store.drTrust()).toHaveLength(1);
    expect(store.flaggedCount()).toBe(1);
    expect(store.fetchedAt()).toBeInstanceOf(Date);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('pairs the loaded sheets by SKU, and empties the pairing on sign-out', async () => {
    respond({
      master: async () => sheetValues(sheetRow({ id: 'm1', sku: 'A' }), sheetRow({ id: 'm2', sku: 'B' })),
      'dr-trust': async () => sheetValues(sheetRow({ id: 'd1', sku: ' a ' }), sheetRow({ id: 'd2', sku: 'C' })),
    });
    await store.ensureLoaded();
    expect(store.pairingCounts()).toEqual({
      linked: 1,
      masterOnly: 1,
      blockedSkus: 0,
      blockedRows: 0,
      unmatchedDrTrust: 1,
    });

    status.set('signed-out');
    TestBed.tick();
    expect(store.pairing()).toEqual({ linked: [], masterOnly: [], blocked: [], orphans: [] });
  });

  describe('rule: all-or-nothing', () => {
    it('shows no data when one sheet fails to load, naming that sheet', async () => {
      respond({
        master: async () => masterRows,
        'dr-trust': async () => {
          throw new SheetLoadError('Dr Trust', 'access', "You don't have access to Dr Trust.");
        },
      });
      await store.ensureLoaded();
      expect(store.master()).toEqual([]);
      expect(store.drTrust()).toEqual([]);
      expect(store.fetchedAt()).toBeNull();
      expect(store.error()).toBe("You don't have access to Dr Trust.");
    });

    it('shows no data when one sheet has a missing column', async () => {
      const noSku = drTrustRows.map((row) => row.filter((_, i) => HEADER[i] !== 'sku'));
      respond({ master: async () => masterRows, 'dr-trust': async () => noSku });
      await store.ensureLoaded();
      expect(store.master()).toEqual([]);
      expect(store.error()).toBe('Dr Trust sheet is missing column: sku');
    });
  });

  it('loads once per session; Retry loads again', async () => {
    respond({ master: async () => masterRows, 'dr-trust': async () => drTrustRows });
    await store.ensureLoaded();
    await store.ensureLoaded();
    expect(read).toHaveBeenCalledTimes(2);

    await store.reload();
    expect(read).toHaveBeenCalledTimes(4);
  });

  it('Retry after a failure loads the data', async () => {
    let fail = true;
    respond({
      master: async () => {
        if (fail) {
          throw new SheetLoadError('Master', 'unavailable', "Couldn't load Master.");
        }
        return masterRows;
      },
      'dr-trust': async () => drTrustRows,
    });
    await store.ensureLoaded();
    expect(store.error()).toBe("Couldn't load Master.");

    fail = false;
    await store.reload();
    expect(store.error()).toBeNull();
    expect(store.master()).toHaveLength(2);
  });

  it('shows no error panel for an expired session (Auth sends the user to sign-in)', async () => {
    respond({
      master: async () => {
        throw new SheetLoadError('Master', 'expired', 'expired');
      },
    });
    await store.ensureLoaded();
    expect(store.error()).toBeNull();
    expect(store.master()).toEqual([]);
  });

  it('clears all data when the user signs out', async () => {
    respond({ master: async () => masterRows, 'dr-trust': async () => drTrustRows });
    await store.ensureLoaded();

    status.set('signed-out');
    TestBed.tick();
    expect(store.master()).toEqual([]);
    expect(store.drTrust()).toEqual([]);
    expect(store.fetchedAt()).toBeNull();
  });

  it('discards a load that finishes after sign-out', async () => {
    let finish: (rows: CellValue[][]) => void = () => undefined;
    respond({
      master: () => new Promise((resolve) => (finish = resolve)),
      'dr-trust': async () => drTrustRows,
    });
    const pending = store.ensureLoaded();

    status.set('signed-out');
    TestBed.tick();
    finish(masterRows);
    await pending;

    expect(store.master()).toEqual([]);
    expect(store.fetchedAt()).toBeNull();
    expect(store.loading()).toBe(false);
  });
});
