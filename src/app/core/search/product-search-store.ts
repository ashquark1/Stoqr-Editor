import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { Auth } from '@core/auth/auth';
import { LoadedProduct } from '@core/models/product';
import { Editability, editability } from '@core/sheets/editability';
import { RowRef } from '@core/sheets/row-ref';
import { syncStatuses } from '@core/sheets/sheet-pairing';
import { SheetsStore } from '@core/sheets/sheets-store';
import { SyncBadgeKind, linkedQtyDiffers, syncBadges } from '@core/sheets/sync-badge';
import { FilterStore } from './filter-store';
import { applyFilters, applyStatusVisibility } from './product-filter';
import { filterProducts, tokenize } from './product-matcher';
import { SearchValidation } from './search-validation';

/** V1's run rules (US-56): typing searches by itself from this many characters (trimmed)… */
export const AUTO_SEARCH_MIN_CHARS = 3;
/** …after this pause; Enter or Search runs any non-empty text at once. */
export const AUTO_SEARCH_DELAY_MS = 300;

/**
 * Search and selection state for the product picker (US-12, US-13). Searches
 * MASTER products only, every status, with V1's matching rules. The TYPED text
 * and the SUBMITTED query are separate (US-56): typing (`setTyped`) runs the
 * search after a 300 ms pause once it has 3+ characters; `setQuery` runs a
 * text at once (Enter/Search, any length); `clear` empties both. Only the
 * submitted query filters, and the filters (`FilterStore`, US-57) apply on top.
 * Nothing about search lives in a component (AI_CONTRACT: Forbidden Shortcuts).
 */
@Injectable({ providedIn: 'root' })
export class ProductSearchStore {
  private readonly sheets = inject(SheetsStore);
  private readonly validation = inject(SearchValidation);
  private readonly auth = inject(Auth);
  private readonly filters = inject(FilterStore);

  private readonly typedSignal = signal('');
  private readonly querySignal = signal('');
  private readonly selectedRefSignal = signal<RowRef | null>(null);
  private pending: ReturnType<typeof setTimeout> | undefined;

  /** What is in the search box. */
  readonly typed = this.typedSignal.asReadonly();
  /** The search that ran (filters the list). */
  readonly query = this.querySignal.asReadonly();
  /** True once something other than spaces has been typed. */
  readonly hasQuery = computed(() => tokenize(this.querySignal()).length > 0);

  private readonly masterProducts = computed(() => this.sheets.master().map((row) => row.product));

  /** V1's "include a product name or brand" message for a size/colour/packing-only query, or null. */
  readonly message = computed(() =>
    this.validation.validate(this.querySignal(), this.masterProducts()),
  );

  /**
   * Master rows matching the query AND the filters (US-57), in sheet order;
   * empty for an empty or unsupported query. All of them are listed — there is
   * no cap (US-55).
   */
  readonly matches = computed<readonly LoadedProduct[]>(() => {
    if (!this.hasQuery() || this.message() !== null) {
      return [];
    }
    // V1's matcher returns the same Product objects it is given: map them back to their rows.
    const rowOf = new Map(this.sheets.master().map((row) => [row.product, row]));
    const searched = filterProducts(this.masterProducts(), this.querySignal()).flatMap((product) => {
      const row = rowOf.get(product);
      return row ? [row] : [];
    });
    const visible = applyStatusVisibility(searched, this.filters.statusToggles());
    return applyFilters(visible, this.filters.selectedFilters());
  });

  readonly totalMatches = computed(() => this.matches().length);
  /** The results toolbar shows once a search has run, and stays while a product is open (US-69). */
  readonly toolbarShown = computed(() => this.hasQuery() || this.selectedRefSignal() !== null);
  /** Filters changed from the defaults, for "Filters (n)". */
  readonly filterCount = computed(() => this.filters.changedCount());
  /** A filter is changed from its default (for "…and filters" wording, US-70). */
  readonly filtersChanged = computed(() => this.filters.changedCount() > 0);

  private readonly statuses = computed(() => syncStatuses(this.sheets.pairing()));

  /** The chosen master row, or null (also null once a reload no longer contains it). */
  readonly selected = computed<LoadedProduct | null>(() => {
    const ref = this.selectedRefSignal();
    return ref === null ? null : (this.sheets.master().find((row) => row.ref === ref) ?? null);
  });

  private readonly selectedPair = computed(() => {
    const ref = this.selectedRefSignal();
    return this.sheets.pairing().linked.find((pair) => pair.master.ref === ref) ?? null;
  });

  /** The selected product's Dr Trust row when the two are linked by SKU. */
  readonly selectedLink = computed<LoadedProduct | null>(() => this.selectedPair()?.drTrust ?? null);

  /** True when the selected product is linked and the sheets hold different quantities (same rule as the badge). */
  readonly drTrustQtyDiffers = computed(() => {
    const pair = this.selectedPair();
    return pair !== null && linkedQtyDiffers(pair);
  });

  /** Sync badge per master row (US-37). */
  private readonly badges = computed(() => syncBadges(this.sheets.pairing()));

  /** The badge for one master row; for templates (reads the computed map). */
  syncBadgeOf(ref: RowRef): SyncBadgeKind | undefined {
    return this.badges().get(ref);
  }

  readonly selectedSyncBadge = computed<SyncBadgeKind | undefined>(() => {
    const row = this.selected();
    return row === null ? undefined : this.badges().get(row.ref);
  });

  /**
   * Refresh may run (US-69): not while one runs, and — until US-60 adds the
   * open-product rules — not while a product is open, since a reload makes new
   * row refs and would close it, dropping unsaved edits.
   */
  readonly refreshAvailable = computed(() => !this.sheets.refreshing() && this.selectedRefSignal() === null);

  readonly selectedEditability = computed<Editability | null>(() => {
    const row = this.selected();
    return row === null ? null : editability(row, this.statuses().get(row.ref));
  });

  constructor() {
    // A new session (sign-out, or a different account on renewal) clears the search; expiry
    // does not, so the selection survives renewal (US-06).
    let lastSession = this.auth.sessionId();
    effect(() => {
      const session = this.auth.sessionId();
      if (session !== lastSession) {
        lastSession = session;
        this.cancelPending();
        this.typedSignal.set('');
        this.querySignal.set('');
        this.selectedRefSignal.set(null);
      }
    });
  }

  /**
   * The box changed (US-56). Empty (after trimming) clears the results at once;
   * 3+ characters search after a 300 ms pause (typing again restarts it);
   * 1–2 characters wait for Enter or Search.
   */
  setTyped(text: string): void {
    this.typedSignal.set(text);
    this.cancelPending();
    const length = text.trim().length;
    if (length === 0) {
      this.querySignal.set('');
    } else if (length >= AUTO_SEARCH_MIN_CHARS) {
      this.pending = setTimeout(() => {
        this.pending = undefined;
        this.querySignal.set(text);
      }, AUTO_SEARCH_DELAY_MS);
    }
  }

  /** Runs `query` at once, any length, and puts it in the box: Enter / Search, or a Data health pick (US-61). */
  setQuery(query: string): void {
    this.cancelPending();
    this.typedSignal.set(query);
    this.querySignal.set(query);
  }

  /** The clear (×): empties the box and the results. */
  clear(): void {
    this.setQuery('');
  }

  private cancelPending(): void {
    clearTimeout(this.pending);
    this.pending = undefined;
  }

  select(ref: RowRef): void {
    this.selectedRefSignal.set(ref);
  }

  clearSelection(): void {
    this.selectedRefSignal.set(null);
  }
}
