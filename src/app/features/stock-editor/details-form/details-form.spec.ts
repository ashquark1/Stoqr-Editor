import { ChangeDetectionStrategy, Component, WritableSignal, computed, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetailsStore } from '@core/details/details-store';
import { LoadedProduct } from '@core/models/product';
import { ProductSearchStore } from '@core/search/product-search-store';
import { mapSheet } from '@core/sheets/data-mapping';
import { BLOCKED_SKU_REASON, Editability } from '@core/sheets/editability';
import { MASTER_SHEET, sheetRow, sheetValues } from '@core/sheets/testing/sheet-fixtures';
import { Modal } from '@shared/ui/modal/modal';
import { DetailsForm } from './details-form';

/** Stand-in for the PrimeNG dialog: renders its content only while open. */
@Component({
  selector: 'stoqr-modal',
  template: `@if (open()) {
    <div class="modal-stub" [attr.data-header]="header()"><ng-content /></div>
  }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ModalStub {
  readonly open = input(false);
  readonly header = input('');
  readonly close = output<void>();
}

describe('DetailsForm (US-21, US-22)', () => {
  const [product] = mapSheet(
    MASTER_SHEET,
    sheetValues(sheetRow({ id: 'a', 'product name': 'BP Monitor', sku: 'DT-BP-01', 'stock qty': 12, mrp: 2999 })),
  );
  let selected: WritableSignal<LoadedProduct | null>;
  let editability: WritableSignal<Editability>;
  let fixture: ComponentFixture<DetailsForm>;
  let el: HTMLElement;
  let store: DetailsStore;

  const render = () => {
    TestBed.tick();
    fixture.detectChanges();
  };
  const input = (key: string) => el.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#detail-${key}`);
  const type = (key: string, text: string) => {
    const box = input(key);
    if (box === null) {
      throw new Error(`no input for ${key}`);
    }
    box.value = text;
    box.dispatchEvent(new Event('input'));
    render();
  };
  const error = (key: string) => el.querySelector(`#detail-${key}-error`)?.textContent?.trim();
  const button = (text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);
  const labels = () => [...el.querySelectorAll('.stoqr-field__label')].map((l) => l.textContent?.replace('*', '').trim());

  beforeEach(() => {
    selected = signal<LoadedProduct | null>(product);
    editability = signal<Editability>({ editable: true, reasons: [] });
    TestBed.configureTestingModule({
      imports: [DetailsForm],
      providers: [
        {
          provide: ProductSearchStore,
          useValue: { selected, selectedLink: signal(null), selectedEditability: computed(() => editability()) },
        },
      ],
    });
    TestBed.overrideComponent(DetailsForm, { remove: { imports: [Modal] }, add: { imports: [ModalStub] } });
    fixture = TestBed.createComponent(DetailsForm);
    el = fixture.nativeElement;
    store = TestBed.inject(DetailsStore);
    render();
  });

  it("shows every field in V1's four groups; never id", () => {
    expect([...el.querySelectorAll('legend')].map((l) => l.textContent?.trim())).toEqual([
      'Product Info',
      'Stock Info',
      'Pricing Info',
      'Additional Info',
    ]);
    expect(labels()).toHaveLength(20);
    expect(labels().map((l) => l?.toLowerCase())).not.toContain('id');
    expect(el.textContent).not.toContain('row-1');
  });

  it('rule: Stock Qty, Stock Status, Last Updated and Created At are shown, never inputs', () => {
    for (const key of ['stockQty', 'stockStatus', 'lastUpdated', 'createdAt']) {
      expect(input(key)).toBeNull();
    }
    expect(el.querySelectorAll('input, textarea')).toHaveLength(16);
    expect(el.textContent).toContain('12');
    expect(el.querySelector('stoqr-badge')).not.toBeNull();
  });

  it('fills the inputs from the product', () => {
    expect(input('productName')?.value).toBe('BP Monitor');
    expect(input('sku')?.value).toBe('DT-BP-01');
    expect(input('mrp')?.value).toBe('2999');
    expect(input('notes')?.tagName).toBe('TEXTAREA');
  });

  it('rule: an invalid value shows an inline message and blocks Review changes', () => {
    expect(button('Review changes')?.disabled).toBe(true); // nothing changed yet
    type('mrp', '1,200');
    expect(error('mrp')).toBe('MRP must be a number ≥ 0, e.g. 12.50.');
    expect(input('mrp')?.getAttribute('aria-invalid')).toBe('true');
    expect(button('Review changes')?.disabled).toBe(true);
    expect(el.querySelector('.details__hint')).not.toBeNull();

    type('mrp', '1200');
    expect(error('mrp')).toBeUndefined();
    expect(button('Review changes')?.disabled).toBe(false);
  });

  it('rule: a blanked required field is flagged, never filled in', () => {
    type('sku', '   ');
    expect(error('sku')).toBe('SKU is required.');
    expect(store.texts().sku).toBe('   ');
  });

  it('rule: a SKU change explains why Review changes is disabled (US-38 first)', () => {
    type('notes', 'Fragile');
    type('sku', 'DT-BP-02');
    expect(button('Review changes')?.disabled).toBe(true);
    expect(el.querySelector('.details__hint')?.textContent).toContain("Changing the SKU isn't available yet");
  });

  it('Review changes swaps the form for the review of only the changed fields (US-23)', () => {
    type('notes', 'Fragile');
    button('Review changes')?.click();
    render();
    expect(el.querySelectorAll('input, textarea')).toHaveLength(0);
    expect(el.querySelector('app-details-review')?.textContent).toContain('Notes');
    button('Back')?.click();
    render();
    expect(input('notes')?.value).toBe('Fragile'); // the edit survives Back
  });

  it('Cancel puts every box back', () => {
    type('notes', 'Fragile');
    button('Cancel')?.click();
    render();
    expect(input('notes')?.value).toBe('');
    expect(button('Cancel')?.disabled).toBe(true);
  });

  it('a product that cannot be edited is read-only, with the reasons', () => {
    editability.set({ editable: false, reasons: [BLOCKED_SKU_REASON] });
    render();
    expect(el.querySelectorAll('input, textarea')).toHaveLength(0);
    expect(el.querySelector('.details__reasons')?.textContent).toContain(BLOCKED_SKU_REASON);
    expect(button('Review changes')).toBeUndefined();
    expect(labels()).toHaveLength(20);
  });

  it('asks "Discard changes?" before leaving with edits; Discard puts the boxes back', () => {
    const leave = vi.fn();
    type('notes', 'Fragile');
    store.confirmLeave(leave);
    render();
    expect(el.querySelector('.modal-stub')?.getAttribute('data-header')).toBe('Discard changes?');
    expect(el.querySelector('.modal-stub')?.textContent).toContain('BP Monitor');
    button('Discard')?.click();
    render();
    expect(leave).toHaveBeenCalledTimes(1);
    expect(el.querySelector('.modal-stub')).toBeNull();
    expect(input('notes')?.value).toBe('');
  });

  it('Keep editing closes the question and keeps the edits', () => {
    const leave = vi.fn();
    type('notes', 'Fragile');
    store.confirmLeave(leave);
    render();
    button('Keep editing')?.click();
    render();
    expect(leave).not.toHaveBeenCalled();
    expect(el.querySelector('.modal-stub')).toBeNull();
    expect(input('notes')?.value).toBe('Fragile');
  });
});
