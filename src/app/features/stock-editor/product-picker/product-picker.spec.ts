import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoadedProduct } from '@core/models/product';
import { ProductSearchStore } from '@core/search/product-search-store';
import { SECONDARY_ONLY_MESSAGE } from '@core/search/search-validation';
import { mapSheet } from '@core/sheets/data-mapping';
import { MASTER_SHEET, sheetRow, sheetValues } from '@core/sheets/testing/sheet-fixtures';
import { ProductPicker } from './product-picker';

describe('ProductPicker', () => {
  const query = signal('');
  const message = signal<string | null>(null);
  const matches = signal<readonly LoadedProduct[]>([]);
  const selected = signal<LoadedProduct | null>(null);
  const search = {
    query,
    hasQuery: computed(() => query().trim() !== ''),
    message,
    matches,
    totalMatches: computed(() => matches().length),
    shown: computed(() => matches().slice(0, 20)),
    selected,
    setQuery: vi.fn((q: string) => query.set(q)),
    select: vi.fn(),
  };
  let fixture: ComponentFixture<ProductPicker>;
  let el: HTMLElement;

  const rows = (count: number) =>
    mapSheet(
      MASTER_SHEET,
      sheetValues(...Array.from({ length: count }, (_, i) => sheetRow({ id: `r${i}`, 'product name': `Strip ${i}`, sku: `S-${i}` }))),
    );

  function type(text: string): void {
    const input = el.querySelector<HTMLInputElement>('input#product-search');
    if (input === null) {
      throw new Error('search input not rendered');
    }
    input.value = text;
    input.dispatchEvent(new Event('input'));
    TestBed.tick();
    fixture.detectChanges();
  }

  beforeEach(() => {
    query.set('');
    message.set(null);
    matches.set([]);
    selected.set(null);
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [ProductPicker],
      providers: [{ provide: ProductSearchStore, useValue: search }],
    });
    fixture = TestBed.createComponent(ProductPicker);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('shows the hint before anything is typed', () => {
    expect(el.querySelector('.picker__hint')?.textContent).toContain('Search by product name, SKU, brand or category');
    expect(el.querySelector('.picker__results')).toBeNull();
  });

  it('sends what is typed to the store (search state lives in the store)', () => {
    type('oxi');
    expect(search.setQuery).toHaveBeenLastCalledWith('oxi');
  });

  it('lists results and selects one on click', () => {
    matches.set(rows(2));
    type('strip');
    const buttons = el.querySelectorAll<HTMLButtonElement>('.picker__result');
    expect([...buttons].map((b) => b.querySelector('.picker__name')?.textContent?.trim())).toEqual(['Strip 0', 'Strip 1']);
    buttons[1].click();
    expect(search.select).toHaveBeenCalledWith(matches()[1].ref);
  });

  it('says how many are hidden when more than 20 match', () => {
    matches.set(rows(25));
    type('strip');
    expect(el.querySelectorAll('.picker__result')).toHaveLength(20);
    expect(el.querySelector('.picker__count')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Showing 20 of 25 — keep typing to narrow',
    );
  });

  it('shows the no-match state with the query', () => {
    type('zzz');
    expect(el.querySelector('stoqr-empty-state')?.textContent).toContain('No products match “zzz”.');
  });

  it('shows V1’s message for a size/colour/packing-only query', () => {
    message.set(SECONDARY_ONLY_MESSAGE);
    type('blue');
    expect(el.querySelector('.picker__hint')?.textContent).toContain(SECONDARY_ONLY_MESSAGE);
  });

  it('hides the results once a product is selected', () => {
    matches.set(rows(2));
    type('strip');
    selected.set(matches()[0]);
    fixture.detectChanges();
    expect(el.querySelector('.picker__results')).toBeNull();
    expect(el.querySelector('input#product-search')).not.toBeNull();
  });
});
