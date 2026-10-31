import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoadedProduct } from '@core/models/product';
import { ProductSearchStore } from '@core/search/product-search-store';
import { SECONDARY_ONLY_MESSAGE } from '@core/search/search-validation';
import { mapSheet } from '@core/sheets/data-mapping';
import { MASTER_SHEET, sheetRow, sheetValues } from '@core/sheets/testing/sheet-fixtures';
import { ProductPicker } from './product-picker';

// The search box moved to `app-search-row` (US-50); the picker renders results only.
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
    selected,
    syncBadgeOf: vi.fn(() => 'linked' as const),
    select: vi.fn(),
  };
  let fixture: ComponentFixture<ProductPicker>;
  let el: HTMLElement;

  const rows = (count: number) =>
    mapSheet(
      MASTER_SHEET,
      sheetValues(...Array.from({ length: count }, (_, i) => sheetRow({ id: `r${i}`, 'product name': `Strip ${i}`, sku: `S-${i}` }))),
    );

  function searchFor(text: string): void {
    query.set(text);
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

  it('shows nothing before a search', () => {
    expect(el.querySelector('.picker__results')).toBeNull();
    expect(el.querySelector('stoqr-empty-state')).toBeNull();
  });

  it('lists results and selects one on click', () => {
    matches.set(rows(2));
    searchFor('strip');
    const buttons = el.querySelectorAll<HTMLButtonElement>('.picker__result');
    expect([...buttons].map((b) => b.querySelector('.picker__name')?.textContent?.trim())).toEqual(['Strip 0', 'Strip 1']);
    buttons[1].click();
    expect(search.select).toHaveBeenCalledWith(matches()[1].ref);
  });

  it('shows each result’s sync badge (US-37)', () => {
    matches.set(rows(2));
    searchFor('strip');
    const badges = [...el.querySelectorAll('.picker__result stoqr-sync-badge')].map((b) => b.textContent?.trim());
    expect(badges).toEqual(['Linked', 'Linked']);
    expect(search.syncBadgeOf).toHaveBeenCalledWith(matches()[0].ref);
  });

  it('rule: lists every match, more than 20 included, with no count line (US-55)', () => {
    matches.set(rows(25));
    searchFor('strip');
    expect(el.querySelectorAll('.picker__result')).toHaveLength(25);
    expect(el.textContent).not.toContain('keep typing to narrow');
  });

  it('shows V1’s no-match message (US-55)', () => {
    searchFor('zzz');
    expect(el.querySelector('stoqr-empty-state')?.textContent).toContain('No products match your search.');
  });

  it('shows V1’s message for a size/colour/packing-only query', () => {
    message.set(SECONDARY_ONLY_MESSAGE);
    searchFor('blue');
    expect(el.querySelector('.picker__hint')?.textContent).toContain(SECONDARY_ONLY_MESSAGE);
  });

  it('hides the results once a product is selected', () => {
    matches.set(rows(2));
    searchFor('strip');
    selected.set(matches()[0]);
    fixture.detectChanges();
    expect(el.querySelector('.picker__results')).toBeNull();
  });
});
