import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoadedProduct } from '@core/models/product';
import { ProductSearchStore } from '@core/search/product-search-store';
import { mapSheet } from '@core/sheets/data-mapping';
import { BLOCKED_SKU_REASON, Editability } from '@core/sheets/editability';
import { SyncBadgeKind } from '@core/sheets/sync-badge';
import { ReviewStep, StockReviewStore } from '@core/stock-adjust/stock-review-store';
import {
  DR_TRUST_SHEET,
  MASTER_SHEET,
  sheetRow,
  sheetValues,
} from '@core/sheets/testing/sheet-fixtures';
import { QuantityAdjuster } from '../quantity-adjuster/quantity-adjuster';
import { ReviewPanel } from '../review-panel/review-panel';
import { ProductSummary } from './product-summary';

@Component({ selector: 'app-quantity-adjuster', template: 'adjuster', changeDetection: ChangeDetectionStrategy.OnPush })
class AdjusterStub {}

@Component({ selector: 'app-review-panel', template: 'review', changeDetection: ChangeDetectionStrategy.OnPush })
class ReviewPanelStub {}

describe('ProductSummary', () => {
  const [product] = mapSheet(
    MASTER_SHEET,
    sheetValues(sheetRow({ 'product name': 'Pulse Oximeter', brand: 'Dr Trust', sku: 'DT-PO', 'stock qty': 12 })),
  );
  const [link] = mapSheet(DR_TRUST_SHEET, sheetValues(sheetRow({ sku: 'DT-PO', 'stock qty': 9 })));

  const selected = signal<LoadedProduct | null>(product);
  const selectedLink = signal<LoadedProduct | null>(null);
  const drTrustQtyDiffers = signal(false);
  const selectedEditability = signal<Editability | null>({ editable: true, reasons: [] });
  const selectedSyncBadge = signal<SyncBadgeKind | undefined>('master-only');
  const search = {
    selected,
    selectedLink,
    drTrustQtyDiffers,
    selectedEditability,
    selectedSyncBadge,
    clearSelection: vi.fn(),
  };
  const step = signal<ReviewStep>('editing');
  let fixture: ComponentFixture<ProductSummary>;
  let el: HTMLElement;

  const fieldValue = (label: string) =>
    [...el.querySelectorAll('.stoqr-field')]
      .find((f) => f.querySelector('.stoqr-field__label')?.textContent?.trim() === label)
      ?.querySelector('.stoqr-field__value')
      ?.textContent?.trim();

  beforeEach(() => {
    selected.set(product);
    selectedLink.set(null);
    drTrustQtyDiffers.set(false);
    selectedEditability.set({ editable: true, reasons: [] });
    selectedSyncBadge.set('master-only');
    step.set('editing');
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [ProductSummary],
      providers: [
        { provide: ProductSearchStore, useValue: search },
        { provide: StockReviewStore, useValue: { step } },
      ],
    });
    TestBed.overrideComponent(ProductSummary, {
      remove: { imports: [QuantityAdjuster, ReviewPanel] },
      add: { imports: [AdjusterStub, ReviewPanelStub] },
    });
    fixture = TestBed.createComponent(ProductSummary);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('shows name, brand, SKU, qty, stock status and status', () => {
    expect(el.querySelector('.summary__title')?.textContent?.trim()).toBe('Pulse Oximeter');
    expect(fieldValue('Brand')).toBe('Dr Trust');
    expect(fieldValue('SKU')).toBe('DT-PO');
    expect(fieldValue('Stock qty')).toBe('12');
    expect(fieldValue('Stock status')).toContain('In Stock');
    expect(fieldValue('Status')).toBe('Active');
    expect(el.querySelector('.summary__note')).toBeNull();
    expect(el.querySelector('.summary__blocked')).toBeNull();
  });

  it('notes the Dr Trust quantity when the linked sheets differ, with the Out of sync badge', () => {
    selectedLink.set(link);
    drTrustQtyDiffers.set(true);
    selectedSyncBadge.set('out-of-sync');
    fixture.detectChanges();
    expect(el.querySelector('.summary__note')?.textContent?.trim()).toBe('Dr Trust sheet has 9.');
    expect(fieldValue('Sync')).toBe('Out of sync');
  });

  it('shows the sync badge as a field (US-37)', () => {
    expect(fieldValue('Sync')).toBe('Master only');
  });

  it('lists why a product cannot be edited, with no adjuster', () => {
    selectedEditability.set({ editable: false, reasons: [BLOCKED_SKU_REASON] });
    fixture.detectChanges();
    expect(el.querySelector('.summary__blocked')?.textContent).toContain(BLOCKED_SKU_REASON);
    expect(el.querySelector('app-quantity-adjuster')).toBeNull();
  });

  it('shows the quantity adjuster only for an editable product (US-15)', () => {
    expect(el.querySelector('app-quantity-adjuster')).not.toBeNull();
    expect(el.querySelector('app-review-panel')).toBeNull();
  });

  it('swaps the adjuster for the review panel once a review is open (US-18)', () => {
    for (const s of ['reviewing', 'saving', 'conflict', 'partial', 'failed'] as const) {
      step.set(s);
      fixture.detectChanges();
      expect(el.querySelector('app-review-panel')).not.toBeNull();
      expect(el.querySelector('app-quantity-adjuster')).toBeNull();
    }
  });

  it('Change product clears the selection', () => {
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Change product')?.click();
    expect(search.clearSelection).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when no product is selected', () => {
    selected.set(null);
    fixture.detectChanges();
    expect(el.querySelector('.summary')).toBeNull();
  });
});
