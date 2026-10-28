import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { Auth } from '@core/auth/auth';
import { LoadedProduct } from '@core/models/product';
import { Editability, editability } from '@core/sheets/editability';
import { RowRef } from '@core/sheets/row-ref';
import { syncStatuses } from '@core/sheets/sheet-pairing';
import { SheetsStore } from '@core/sheets/sheets-store';
import { filterProducts, tokenize } from './product-matcher';
import { SearchValidation } from './search-validation';

/** How many matches the picker lists at once; staff keep typing to narrow. */
export const MAX_SHOWN = 20;

/**
 * Search and selection state for the product picker (US-12, US-13). Searches
 * MASTER products only, every status, with V1's matching rules. Components read
 * these signals and call `setQuery`, `select`, `clearSelection`; nothing about
 * search lives in a component (AI_CONTRACT: Forbidden Shortcuts).
 */
@Injectable({ providedIn: 'root' })
export class ProductSearchStore {
  private readonly sheets = inject(SheetsStore);
  private readonly validation = inject(SearchValidation);
  private readonly auth = inject(Auth);

  private readonly querySignal = signal('');
  private readonly selectedRefSignal = signal<RowRef | null>(null);

  readonly query = this.querySignal.asReadonly();
  /** True once something other than spaces has been typed. */
  readonly hasQuery = computed(() => tokenize(this.querySignal()).length > 0);

  private readonly masterProducts = computed(() => this.sheets.master().map((row) => row.product));

  /** V1's "include a product name or brand" message for a size/colour/packing-only query, or null. */
  readonly message = computed(() =>
    this.validation.validate(this.querySignal(), this.masterProducts()),
  );

  /** Master rows matching the query, in sheet order; empty for an empty or unsupported query. */
  readonly matches = computed<readonly LoadedProduct[]>(() => {
    if (!this.hasQuery() || this.message() !== null) {
      return [];
    }
    // V1's matcher returns the same Product objects it is given: map them back to their rows.
    const rowOf = new Map(this.sheets.master().map((row) => [row.product, row]));
    return filterProducts(this.masterProducts(), this.querySignal()).flatMap((product) => {
      const row = rowOf.get(product);
      return row ? [row] : [];
    });
  });

  readonly totalMatches = computed(() => this.matches().length);
  readonly shown = computed(() => this.matches().slice(0, MAX_SHOWN));

  private readonly statuses = computed(() => syncStatuses(this.sheets.pairing()));

  /** The chosen master row, or null (also null once a reload no longer contains it). */
  readonly selected = computed<LoadedProduct | null>(() => {
    const ref = this.selectedRefSignal();
    return ref === null ? null : (this.sheets.master().find((row) => row.ref === ref) ?? null);
  });

  /** The selected product's Dr Trust row when the two are linked by SKU. */
  readonly selectedLink = computed<LoadedProduct | null>(() => {
    const ref = this.selectedRefSignal();
    return this.sheets.pairing().linked.find((pair) => pair.master.ref === ref)?.drTrust ?? null;
  });

  /** True when the selected product is linked and the two sheets hold different quantities. */
  readonly drTrustQtyDiffers = computed(() => {
    const master = this.selected();
    const drTrust = this.selectedLink();
    return master !== null && drTrust !== null && master.product.stockQty !== drTrust.product.stockQty;
  });

  readonly selectedEditability = computed<Editability | null>(() => {
    const row = this.selected();
    return row === null ? null : editability(row, this.statuses().get(row.ref));
  });

  constructor() {
    effect(() => {
      if (this.auth.status() === 'signed-out') {
        this.querySignal.set('');
        this.selectedRefSignal.set(null);
      }
    });
  }

  setQuery(query: string): void {
    this.querySignal.set(query);
  }

  select(ref: RowRef): void {
    this.selectedRefSignal.set(ref);
  }

  clearSelection(): void {
    this.selectedRefSignal.set(null);
  }
}
