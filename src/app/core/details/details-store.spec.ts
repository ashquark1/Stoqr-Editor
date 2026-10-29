import { WritableSignal, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LoadedProduct } from '@core/models/product';
import { ProductSearchStore } from '@core/search/product-search-store';
import { mapSheet } from '@core/sheets/data-mapping';
import { Editability } from '@core/sheets/editability';
import { MASTER_SHEET, sheetRow, sheetValues } from '@core/sheets/testing/sheet-fixtures';
import { DetailsStore } from './details-store';

describe('DetailsStore (US-21, US-22)', () => {
  const [monitor, legacy] = mapSheet(
    MASTER_SHEET,
    sheetValues(
      sheetRow({ id: 'a', 'product name': 'BP Monitor', mrp: 2999, 'tax rate': 0.18, size: '' }),
      // A row with blanks the owner now requires.
      sheetRow({ id: 'b', category: '', packing: '', 'low stock threshold': '', mrp: '' }),
    ),
  );
  let selected: WritableSignal<LoadedProduct | null>;
  let editable: WritableSignal<boolean>;
  let store: DetailsStore;

  beforeEach(() => {
    selected = signal<LoadedProduct | null>(monitor);
    editable = signal(true);
    const selectedEditability = computed<Editability | null>(() =>
      selected() === null ? null : { editable: editable(), reasons: editable() ? [] : ['Not editable'] },
    );
    TestBed.configureTestingModule({
      providers: [{ provide: ProductSearchStore, useValue: { selected, selectedEditability } }],
    });
    store = TestBed.inject(DetailsStore);
  });

  const select = (row: LoadedProduct | null) => {
    selected.set(row);
    TestBed.tick();
  };

  it('starts from the product: blank for null, numbers as plain digits', () => {
    expect(store.texts().productName).toBe('BP Monitor');
    expect(store.texts().mrp).toBe('2999');
    expect(store.texts().taxRate).toBe('0.18');
    expect(store.texts().size).toBe('');
    expect(store.valid()).toBe(true);
    expect(store.hasChanges()).toBe(false);
    expect(store.canReview()).toBe(false);
  });

  it('rule: required blanks already in the sheet are flagged as soon as the form opens', () => {
    select(legacy);
    expect(store.errors()).toEqual({
      category: 'Category is required.',
      packing: 'Packing is required.',
      lowStockThreshold: 'Low Stock Threshold is required.',
    });
    expect(store.valid()).toBe(false);
  });

  it('rule: Review changes needs a change AND every field valid', () => {
    store.setTexts({ notes: 'Fragile' });
    expect(store.changedFields()).toEqual(['notes']);
    expect(store.canReview()).toBe(true);

    store.setTexts({ mrp: '-5' });
    expect(store.errors()).toEqual({ mrp: 'MRP must be a number ≥ 0, e.g. 12.50.' });
    expect(store.canReview()).toBe(false);
  });

  it('rule: changes compare by value: 18.0 for a tax rate of 18 is no change', () => {
    select(legacy); // tax rate 18 (fixture default)
    store.setTexts({ category: 'Health', packing: 'Box', lowStockThreshold: '5', taxRate: '18.0' });
    expect(store.changedFields()).toEqual(['category', 'lowStockThreshold', 'packing']); // form order
  });

  it('rule: a field the user did not touch follows fresh data (never undoes someone else)', () => {
    store.setTexts({ notes: 'mine' });
    selected.set({ ...monitor, product: { ...monitor.product, brand: 'Changed elsewhere', notes: 'theirs' } });
    expect(store.texts().brand).toBe('Changed elsewhere');
    expect(store.texts().notes).toBe('mine');
    expect(store.changedFields()).toEqual(['notes']);
  });

  it('rule: a SKU change blocks Review until US-38', () => {
    store.setTexts({ sku: 'NEW-1', notes: 'x' });
    expect(store.skuChanged()).toBe(true);
    expect(store.canReview()).toBe(false);
    store.setTexts({ sku: monitor.product.sku });
    expect(store.canReview()).toBe(true);
  });

  it('typing a field back to its original is no change', () => {
    store.setTexts({ brand: 'Other' });
    store.setTexts({ brand: 'Dr Trust' });
    expect(store.hasChanges()).toBe(false);
  });

  it('reset puts every field back', () => {
    store.setTexts({ notes: 'x', sku: '' });
    store.reset();
    expect(store.texts()).toEqual(store.original());
  });

  it('a product that cannot be edited never has changes or Review', () => {
    editable.set(false);
    store.setTexts({ notes: 'x' });
    expect(store.hasChanges()).toBe(false);
    expect(store.canReview()).toBe(false);
    expect(store.reasons()).toEqual(['Not editable']);
  });

  it('resets when the selected product changes or the selection clears', () => {
    store.setTexts({ notes: 'x' });
    select(legacy);
    expect(store.texts().category).toBe('');
    expect(store.hasChanges()).toBe(false);
    store.setTexts({ notes: 'y' });
    select(null);
    expect(store.texts().notes).toBe('');
  });

  describe('Discard changes?', () => {
    it('with no changes, leaves at once', () => {
      const leave = vi.fn();
      store.confirmLeave(leave);
      expect(leave).toHaveBeenCalledTimes(1);
      expect(store.leavePending()).toBe(false);
    });

    it('rule: with changes, asks first; Keep editing keeps the edits and stays', () => {
      const leave = vi.fn();
      store.setTexts({ notes: 'x' });
      store.confirmLeave(leave);
      expect(leave).not.toHaveBeenCalled();
      expect(store.leavePending()).toBe(true);
      store.keepEditing();
      expect(store.leavePending()).toBe(false);
      expect(store.texts().notes).toBe('x');
      expect(leave).not.toHaveBeenCalled();
    });

    it('Discard drops the edits, then leaves', () => {
      const leave = vi.fn();
      store.setTexts({ notes: 'x' });
      store.confirmLeave(leave);
      store.discardAndLeave();
      expect(leave).toHaveBeenCalledTimes(1);
      expect(store.hasChanges()).toBe(false);
      expect(store.leavePending()).toBe(false);
    });
  });
});
