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
      expect(store.error()).toBe(
        "You don't have access to Dr Trust. Ask the owner to share it with you as Editor.",
      );
      expect(store.noAccess()).toBe(true);
    });

    it('shows no data when one sheet has a missing column', async () => {
      const noSku = drTrustRows.map((row) => row.filter((_, i) => HEADER[i] !== 'sku'));
      respond({ master: async () => masterRows, 'dr-trust': async () => noSku });
      await store.ensureLoaded();
      expect(store.master()).toEqual([]);
      expect(store.error()).toBe('Dr Trust sheet is missing column: sku');
      expect(store.noAccess()).toBe(false);
    });
  });

  describe('naming every sheet that failed (US-32)', () => {
    const refused = (label: string) => async () => {
      throw new SheetLoadError(label, 'access', `You don't have access to ${label}.`);
    };

    it('names both sheets when neither can be opened', async () => {
      respond({ master: refused('Master'), 'dr-trust': refused('Dr Trust') });
      await store.ensureLoaded();
      expect(store.error()).toBe(
        "You don't have access to Master or Dr Trust. Ask the owner to share them with you as Editor.",
      );
      expect(store.noAccess()).toBe(true);
      expect(store.master()).toEqual([]);
    });

    it('shows both messages when the sheets fail for different reasons', async () => {
      respond({
        master: refused('Master'),
        'dr-trust': async () => {
          throw new SheetLoadError('Dr Trust', 'unavailable', "Couldn't load Dr Trust.");
        },
      });
      await store.ensureLoaded();
      // Mixed failures: each sheet's own message, in sheet order.
      expect(store.error()).toBe("You don't have access to Master. Couldn't load Dr Trust.");
      expect(store.noAccess()).toBe(true);
    });

    it('a successful Retry clears the no-access state', async () => {
      let allowed = false;
      respond({
        master: async () => {
          if (!allowed) {
            throw new SheetLoadError('Master', 'access', 'no');
          }
          return masterRows;
        },
        'dr-trust': async () => drTrustRows,
      });
      await store.ensureLoaded();
      expect(store.noAccess()).toBe(true);

      allowed = true;
      await store.reload();
      expect(store.noAccess()).toBe(false);
      expect(store.error()).toBeNull();
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
