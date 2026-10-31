import { Injectable, Signal, computed, effect, inject, signal } from '@angular/core';

import { Auth } from '@core/auth/auth';
import { SheetsStore } from '@core/sheets/sheets-store';
import {
  FACET_KEYS,
  FacetKey,
  FilterOption,
  STOCK_STATUS_OPTIONS,
  SelectedFilters,
  StatusToggles,
  distinctOptions,
  facetValue,
} from './product-filter';

/**
 * Filter STATE (US-57; V1's `FilterService`, copied): the selected values per
 * facet (empty = "All") and the two visibility toggles, which START ON in the
 * Editor (all products shown). Matching is the pure `applyFilters` /
 * `applyStatusVisibility`; `ProductSearchStore` applies them on top of the
 * search. `reset()` restores the defaults and can be called from code (US-61).
 */
@Injectable({ providedIn: 'root' })
export class FilterStore {
  private readonly sheets = inject(SheetsStore);
  private readonly auth = inject(Auth);

  private readonly selected: Readonly<Record<FacetKey, ReturnType<typeof signal<ReadonlySet<string>>>>> = {
    status: signal<ReadonlySet<string>>(new Set()),
    category: signal<ReadonlySet<string>>(new Set()),
    subCategory: signal<ReadonlySet<string>>(new Set()),
    brand: signal<ReadonlySet<string>>(new Set()),
  };
  private readonly showInactiveSignal = signal(true);
  private readonly showDiscontinuedSignal = signal(true);

  readonly showInactive = this.showInactiveSignal.asReadonly();
  readonly showDiscontinued = this.showDiscontinuedSignal.asReadonly();

  readonly statusToggles = computed<StatusToggles>(() => ({
    showInactive: this.showInactiveSignal(),
    showDiscontinued: this.showDiscontinuedSignal(),
  }));

  readonly selectedFilters = computed<SelectedFilters>(() => ({
    status: this.selected.status(),
    category: this.selected.category(),
    subCategory: this.selected.subCategory(),
    brand: this.selected.brand(),
  }));

  /** The selected values per facet as arrays, for the dropdowns (US-70). */
  readonly selectedValues = computed<Readonly<Record<FacetKey, readonly string[]>>>(() => ({
    status: [...this.selected.status()],
    category: [...this.selected.category()],
    subCategory: [...this.selected.subCategory()],
    brand: [...this.selected.brand()],
  }));

  /** "Filters (n)": dropdowns with a selection plus toggles switched off (A-UI-8). */
  readonly changedCount = computed(
    () =>
      FACET_KEYS.filter((f) => this.selected[f]().size > 0).length +
      (this.showInactiveSignal() ? 0 : 1) +
      (this.showDiscontinuedSignal() ? 0 : 1),
  );

  /** Dropdown options built from the master products. */
  readonly options = computed<Readonly<Record<FacetKey, readonly FilterOption[]>>>(() => {
    const products = this.sheets.master().map((row) => row.product);
    return {
      status: STOCK_STATUS_OPTIONS,
      category: distinctOptions(products, facetValue.category),
      subCategory: distinctOptions(products, facetValue.subCategory),
      brand: distinctOptions(products, facetValue.brand),
    };
  });

  constructor() {
    // A new session starts with the default filters.
    let lastSession = this.auth.sessionId();
    effect(() => {
      const session = this.auth.sessionId();
      if (session !== lastSession) {
        lastSession = session;
        this.reset();
      }
    });
  }

  selectedFor(facet: FacetKey): Signal<ReadonlySet<string>> {
    return this.selected[facet].asReadonly();
  }

  /** Records a facet's selection (empty = "All"). */
  setSelected(facet: FacetKey, values: readonly string[]): void {
    this.selected[facet].set(new Set(values));
  }

  setShowInactive(show: boolean): void {
    this.showInactiveSignal.set(show);
  }

  setShowDiscontinued(show: boolean): void {
    this.showDiscontinuedSignal.set(show);
  }

  /** Every dropdown back to "All", both toggles back on. */
  reset(): void {
    for (const f of FACET_KEYS) {
      this.selected[f].set(new Set());
    }
    this.showInactiveSignal.set(true);
    this.showDiscontinuedSignal.set(true);
  }
}
