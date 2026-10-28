import { WritableSignal, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LoadedProduct } from '@core/models/product';
import { ProductSearchStore } from '@core/search/product-search-store';
import { mapSheet } from '@core/sheets/data-mapping';
import { Editability } from '@core/sheets/editability';
import { MASTER_SHEET, sheetRow, sheetValues } from '@core/sheets/testing/sheet-fixtures';
import { StockAdjustStore } from './stock-adjust-store';
import { deriveStockStatus } from './stock-status';

describe('StockAdjustStore', () => {
  const [stocked, other, noThreshold] = mapSheet(
    MASTER_SHEET,
    sheetValues(
      sheetRow({ id: 'a', 'stock qty': 120, 'low stock threshold': 100 }),
      sheetRow({ id: 'b', 'stock qty': 5, 'low stock threshold': 2 }),
      sheetRow({ id: 'c', 'stock qty': 3, 'low stock threshold': '' }),
    ),
  );
  let selected: WritableSignal<LoadedProduct | null>;
  let editable: WritableSignal<boolean>;
  let store: StockAdjustStore;

  beforeEach(() => {
    selected = signal<LoadedProduct | null>(stocked);
    editable = signal(true);
    const selectedEditability = computed<Editability | null>(() =>
      selected() === null ? null : { editable: editable(), reasons: editable() ? [] : ['Not editable'] },
    );
    TestBed.configureTestingModule({
      providers: [{ provide: ProductSearchStore, useValue: { selected, selectedEditability } }],
    });
    store = TestBed.inject(StockAdjustStore);
    TestBed.tick();
  });

  it('proposes nothing until Add or Subtract is chosen (no silent default)', () => {
    store.setAmount('15');
    expect(store.mode()).toBeNull();
    expect(store.proposal()).toBeNull();
    expect(store.readyForReview()).toBe(false);
  });

  it('works from the master quantity and shows the change', () => {
    store.setMode('subtract');
    store.setAmount('15');
    expect(store.current()).toBe(120);
    expect(store.proposal()).toEqual({ ok: true, current: 120, delta: -15, proposed: 105 });
    expect(store.deltaText()).toBe('−15');
    expect(store.readyForReview()).toBe(true);
  });

  it('rule: the preview status is deriveStockStatus for the proposed quantity', () => {
    store.setMode('subtract');
    for (const amount of [1, 20, 21, 119, 120]) {
      store.setAmount(String(amount));
      const p = store.proposal();
      expect(p?.ok).toBe(true);
      if (p?.ok) {
        expect(store.proposedStatus()).toBe(deriveStockStatus(p.proposed, 100));
      }
    }
  });

  it('warns when the new quantity drops below the threshold', () => {
    store.setMode('subtract');
    store.setAmount('20');
    expect(store.lowStockWarning()).toBe(false); // 100 = threshold → In Stock
    store.setAmount('21');
    expect(store.lowStockWarning()).toBe(true); // 99
    expect(store.proposedStatus()).toBe('Low Stock');
  });

  it('no threshold: no warning', () => {
    selected.set(noThreshold);
    TestBed.tick();
    store.setMode('subtract');
    store.setAmount('2');
    expect(store.lowStockWarning()).toBe(false);
    expect(store.proposedStatus()).toBe('In Stock');
  });

  it('a blocked proposal is not ready for review', () => {
    store.setMode('subtract');
    store.setAmount('500');
    expect(store.proposal()).toMatchObject({ ok: false, reason: 'below-zero' });
    expect(store.readyForReview()).toBe(false);
  });

  it('a non-editable product is never ready for review', () => {
    editable.set(false);
    store.setMode('add');
    store.setAmount('1');
    expect(store.proposal()?.ok).toBe(true);
    expect(store.readyForReview()).toBe(false);
  });

  it('resets when another product is selected, and when the selection clears', () => {
    store.setMode('add');
    store.setAmount('4');
    selected.set(other);
    TestBed.tick();
    expect(store.mode()).toBeNull();
    expect(store.amountText()).toBe('');

    store.setMode('add');
    store.setAmount('4');
    selected.set(null);
    TestBed.tick();
    expect(store.mode()).toBeNull();
    expect(store.proposal()).toBeNull();
  });
});
