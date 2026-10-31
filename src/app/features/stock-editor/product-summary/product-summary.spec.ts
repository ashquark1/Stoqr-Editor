import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, DeferBlockState, TestBed } from '@angular/core/testing';

import { DetailsStore } from '@core/details/details-store';
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
import { DetailsForm } from '../details-form/details-form';
import { QuantityAdjuster } from '../quantity-adjuster/quantity-adjuster';
import { ProductSummary } from './product-summary';

@Component({ selector: 'app-quantity-adjuster', template: 'adjuster', changeDetection: ChangeDetectionStrategy.OnPush })
class AdjusterStub {}

@Component({ selector: 'app-review-panel', template: 'review', changeDetection: ChangeDetectionStrategy.OnPush })
class ReviewPanelStub {}

@Component({ selector: 'app-details-form', template: 'details', changeDetection: ChangeDetectionStrategy.OnPush })
class DetailsFormStub {}

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
  /** Unsaved details edits: leaving waits (the real store asks "Discard changes?"). */
  let unsaved = false;
  const confirmLeave = vi.fn((leave: () => void) => {
    if (!unsaved) {
      leave();
    }
  });
  let fixture: ComponentFixture<ProductSummary>;
  let el: HTMLElement;

  const button = (text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);

  const fieldValue = (label: string) =>
    [...el.querySelectorAll('.stoqr-field')]
      .find((f) => f.querySelector('.stoqr-field__label')?.textContent?.trim() === label)
      ?.querySelector('.stoqr-field__value')
      ?.textContent?.trim();

  beforeEach(async () => {
    selected.set(product);
    selectedLink.set(null);
    drTrustQtyDiffers.set(false);
    selectedEditability.set({ editable: true, reasons: [] });
    selectedSyncBadge.set('master-only');
    step.set('editing');
    unsaved = false;
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [ProductSummary],
      providers: [
        { provide: ProductSearchStore, useValue: search },
        { provide: StockReviewStore, useValue: { step } },
        { provide: DetailsStore, useValue: { confirmLeave } },
      ],
    });
    TestBed.overrideComponent(ProductSummary, {
      remove: { imports: [DetailsForm, QuantityAdjuster] },
      add: { imports: [DetailsFormStub, AdjusterStub] },
    });
    // The @defer block's dependencies are resolved asynchronously.
    await TestBed.compileComponents();
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

  it('Change product is disabled while a save runs (US-11)', () => {
    const change = () =>
      [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Change product');
    expect(change()?.disabled).toBe(false);
    step.set('saving');
    fixture.detectChanges();
    expect(change()?.disabled).toBe(true);
  });

  it('Change product clears the selection', () => {
    button('Change product')?.click();
    expect(search.clearSelection).toHaveBeenCalledTimes(1);
  });

  describe('one editor at a time (US-21)', () => {
    /** The details form is behind @defer (loads on idle); render it as if loaded. */
    async function renderDeferred(): Promise<void> {
      fixture.detectChanges();
      for (const block of await fixture.getDeferBlocks()) {
        await block.render(DeferBlockState.Complete);
      }
      fixture.detectChanges();
    }

    async function openDetails(): Promise<void> {
      button('Edit details')?.click();
      await renderDeferred();
    }

    it('starts on Adjust stock; Edit details swaps the adjuster for the details form', async () => {
      expect(button('Adjust stock')?.getAttribute('aria-pressed')).toBe('true');
      await openDetails();
      expect(el.querySelector('app-details-form')).not.toBeNull();
      expect(el.querySelector('app-quantity-adjuster')).toBeNull();
      expect(button('Edit details')?.getAttribute('aria-pressed')).toBe('true');
    });

    it('rule: leaving the details form goes through confirmLeave (unsaved edits are never dropped silently)', async () => {
      await openDetails();
      unsaved = true;
      button('Adjust stock')?.click();
      button('Change product')?.click();
      fixture.detectChanges();
      expect(confirmLeave).toHaveBeenCalledTimes(3); // Edit details, Adjust stock, Change product
      expect(el.querySelector('app-details-form')).not.toBeNull();
      expect(search.clearSelection).not.toHaveBeenCalled();
    });

    it('cannot switch while a stock review is open, saving or waiting on Retry', () => {
      step.set('partial');
      fixture.detectChanges();
      expect(button('Adjust stock')?.disabled).toBe(true);
      expect(button('Edit details')?.disabled).toBe(true);
    });

    it('a product that cannot be edited offers a read-only Details view', async () => {
      selectedEditability.set({ editable: false, reasons: [BLOCKED_SKU_REASON] });
      fixture.detectChanges();
      expect(button('Edit details')).toBeUndefined();
      button('Details')?.click();
      await renderDeferred();
      expect(el.querySelector('app-details-form')).not.toBeNull();
      expect(el.querySelector('.summary__blocked')).toBeNull();
    });
  });

  it('renders nothing when no product is selected', () => {
    selected.set(null);
    fixture.detectChanges();
    expect(el.querySelector('.summary')).toBeNull();
  });
});
