import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoadedProduct } from '@core/models/product';
import { mapSheet } from '@core/sheets/data-mapping';
import { SheetsStore } from '@core/sheets/sheets-store';
import {
  DR_TRUST_SHEET,
  MASTER_SHEET,
  sheetRow,
  sheetValues,
} from '@core/sheets/testing/sheet-fixtures';
import { StockEditor } from './stock-editor';

describe('StockEditor (load-check view)', () => {
  const loading = signal(false);
  const error = signal<string | null>(null);
  const fetchedAt = signal<Date | null>(null);
  const master = signal<readonly LoadedProduct[]>([]);
  const drTrust = signal<readonly LoadedProduct[]>([]);
  const flaggedCount = signal(0);
  const pairingCounts = signal({
    linked: 0,
    masterOnly: 0,
    blockedSkus: 0,
    blockedRows: 0,
    unmatchedDrTrust: 0,
  });
  const store = {
    loading,
    error,
    fetchedAt,
    master,
    drTrust,
    flaggedCount,
    pairingCounts,
    ensureLoaded: vi.fn(() => Promise.resolve()),
    reload: vi.fn(() => Promise.resolve()),
  };
  let fixture: ComponentFixture<StockEditor>;
  let el: HTMLElement;

  function loaded(): void {
    master.set(
      mapSheet(
        MASTER_SHEET,
        sheetValues(sheetRow({ id: 'm1', 'product name': 'Thermometer' }), sheetRow({ id: '' })),
      ),
    );
    drTrust.set(mapSheet(DR_TRUST_SHEET, sheetValues(sheetRow({ id: 'd1', 'product name': 'Nebulizer' }))));
    flaggedCount.set(1);
    fetchedAt.set(new Date());
    fixture.detectChanges();
  }

  const names = () => [...el.querySelectorAll('td.td-name')].map((td) => td.textContent?.trim());
  const button = (label: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label);

  beforeEach(() => {
    loading.set(false);
    error.set(null);
    fetchedAt.set(null);
    master.set([]);
    drTrust.set([]);
    flaggedCount.set(0);
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [StockEditor],
      providers: [{ provide: SheetsStore, useValue: store }],
    });
    fixture = TestBed.createComponent(StockEditor);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('starts the load when opened', () => {
    expect(store.ensureLoaded).toHaveBeenCalledTimes(1);
  });

  it('shows the loading overlay while loading', () => {
    loading.set(true);
    fixture.detectChanges();
    expect(el.querySelector('stoqr-loading-overlay')).not.toBeNull();
    expect(el.querySelector('table')).toBeNull();
  });

  it('shows the error with a Retry that reloads, and no data', () => {
    error.set("You don't have access to Dr Trust.");
    fixture.detectChanges();
    expect(el.querySelector('stoqr-empty-state')?.textContent).toContain(
      "You don't have access to Dr Trust.",
    );
    expect(el.querySelector('table')).toBeNull();
    button('Retry')?.click();
    expect(store.reload).toHaveBeenCalledTimes(1);
  });

  it('shows counts and the master table, then switches to Dr Trust', () => {
    loaded();
    expect(el.querySelector('.load-check__counts')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Master: 2 products · Dr Trust: 1 products · 1 flagged',
    );
    expect(names()).toEqual(['Thermometer', 'BP Monitor']);
    expect(button('Master')?.getAttribute('aria-pressed')).toBe('true');

    button('Dr Trust')?.click();
    fixture.detectChanges();
    expect(names()).toEqual(['Nebulizer']);
    expect(button('Dr Trust')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the SKU pairing counts, with blocked as SKUs and rows', () => {
    pairingCounts.set({ linked: 3, masterOnly: 4, blockedSkus: 1, blockedRows: 2, unmatchedDrTrust: 5 });
    loaded();
    expect(el.querySelector('.load-check__pairing')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Linked 3 · Master only 4 · Blocked 1 SKUs (2 rows) · Unmatched Dr Trust 5',
    );
  });

  it('shows the flag text for a row that is not editable', () => {
    loaded();
    expect(el.querySelector('tbody tr:nth-child(2) .load-check__flags')?.textContent).toContain(
      'Not editable: missing id',
    );
  });

  it('shows an empty state for a sheet with no products', () => {
    fetchedAt.set(new Date());
    fixture.detectChanges();
    expect(el.querySelector('stoqr-empty-state')?.textContent).toContain('No products in this sheet.');
  });
});
