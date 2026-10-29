import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Auth } from '@core/auth/auth';
import { LoadedProduct } from '@core/models/product';
import { ProductSearchStore } from '@core/search/product-search-store';
import { mapSheet } from '@core/sheets/data-mapping';
import { SheetsStore } from '@core/sheets/sheets-store';
import { StockReviewStore } from '@core/stock-adjust/stock-review-store';
import { MASTER_SHEET, sheetRow, sheetValues } from '@core/sheets/testing/sheet-fixtures';
import { ProductPicker } from './product-picker/product-picker';
import { ProductSummary } from './product-summary/product-summary';
import { StockEditor } from './stock-editor';

@Component({ selector: 'app-product-picker', template: 'picker', changeDetection: ChangeDetectionStrategy.OnPush })
class PickerStub {}

@Component({ selector: 'app-product-summary', template: 'summary', changeDetection: ChangeDetectionStrategy.OnPush })
class SummaryStub {}

describe('StockEditor (page)', () => {
  const loading = signal(false);
  const error = signal<string | null>(null);
  const noAccess = signal(false);
  const fetchedAt = signal<Date | null>(null);
  const master = signal<readonly LoadedProduct[]>([]);
  const sheets = {
    loading,
    error,
    noAccess,
    fetchedAt,
    master,
    ensureLoaded: vi.fn(() => Promise.resolve()),
    reload: vi.fn(() => Promise.resolve()),
  };
  const selected = signal<LoadedProduct | null>(null);
  const auth = { signOut: vi.fn() };
  const notice = signal<string | null>(null);
  const review = { notice, clearNotice: vi.fn(() => notice.set(null)) };
  let fixture: ComponentFixture<StockEditor>;
  let el: HTMLElement;

  const button = (label: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label);

  function loaded(products = mapSheet(MASTER_SHEET, sheetValues(sheetRow()))): void {
    master.set(products);
    fetchedAt.set(new Date());
    fixture.detectChanges();
  }

  beforeEach(() => {
    loading.set(false);
    error.set(null);
    noAccess.set(false);
    fetchedAt.set(null);
    master.set([]);
    selected.set(null);
    notice.set(null);
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [StockEditor],
      providers: [
        { provide: SheetsStore, useValue: sheets },
        { provide: ProductSearchStore, useValue: { selected } },
        { provide: Auth, useValue: auth },
        { provide: StockReviewStore, useValue: review },
      ],
    });
    TestBed.overrideComponent(StockEditor, {
      remove: { imports: [ProductPicker, ProductSummary] },
      add: { imports: [PickerStub, SummaryStub] },
    });
    fixture = TestBed.createComponent(StockEditor);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('confirms a saved change in a success toast, which can be dismissed (US-20)', () => {
    loaded();
    expect(el.querySelector('stoqr-toast')).toBeNull();
    notice.set('Pulse Oximeter is now 7 (Master and Dr Trust).');
    fixture.detectChanges();
    const toast = el.querySelector('.stoqr-toast');
    expect(toast?.classList).toContain('stoqr-toast--success');
    expect(toast?.textContent).toContain('Stock saved');
    expect(toast?.textContent).toContain('Pulse Oximeter is now 7 (Master and Dr Trust).');
    el.querySelector<HTMLButtonElement>('.toast-close')?.click();
    fixture.detectChanges();
    expect(review.clearNotice).toHaveBeenCalledTimes(1);
    expect(el.querySelector('stoqr-toast')).toBeNull();
  });

  it('starts loading both sheets when opened', () => {
    expect(sheets.ensureLoaded).toHaveBeenCalledTimes(1);
  });

  it('shows the loading overlay while loading', () => {
    loading.set(true);
    fixture.detectChanges();
    expect(el.querySelector('stoqr-loading-overlay')).not.toBeNull();
    expect(el.querySelector('app-product-picker')).toBeNull();
  });

  it('shows the error with Retry, and Sign out only when access is refused', () => {
    error.set("Couldn't load Master.");
    fixture.detectChanges();
    expect(el.querySelector('stoqr-empty-state')?.textContent).toContain("Couldn't load Master.");
    button('Retry')?.click();
    expect(sheets.reload).toHaveBeenCalledTimes(1);
    expect(button('Sign out')).toBeUndefined();

    noAccess.set(true);
    fixture.detectChanges();
    button('Sign out')?.click();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state when the master sheet has no products', () => {
    loaded([]);
    expect(el.querySelector('stoqr-empty-state')?.textContent).toContain('No products in the master sheet.');
    expect(el.querySelector('app-product-picker')).toBeNull();
  });

  it('shows the picker once loaded, and the summary only after a selection', () => {
    loaded();
    expect(el.querySelector('app-product-picker')).not.toBeNull();
    expect(el.querySelector('app-product-summary')).toBeNull();

    selected.set(master()[0]);
    fixture.detectChanges();
    expect(el.querySelector('app-product-summary')).not.toBeNull();
  });

  it('no longer renders the temporary load-check table', () => {
    loaded();
    expect(el.querySelector('table')).toBeNull();
    expect(el.querySelector('.load-check__counts')).toBeNull();
  });
});
