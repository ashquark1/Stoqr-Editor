import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { Auth } from '@core/auth/auth';
import { PanelStore } from '@core/layout/panel-store';
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
 * A search that runs while a product is open shows the results as an overlay
 * over it (US-59); the box text that led to the product is remembered so a
 * cancelled overlay can put it back. The rules that may ask "Discard changes?"
 * (opening, closing, clearing) are in `ProductNavigation`.
 * Nothing about search lives in a component (AI_CONTRACT: Forbidden Shortcuts).
 */
@Injectable({ providedIn: 'root' })
export class ProductSearchStore {
  private readonly sheets = inject(SheetsStore);
  private readonly validation = inject(SearchValidation);
  private readonly auth = inject(Auth);
  private readonly filters = inject(FilterStore);
  private readonly panels = inject(PanelStore);

  private readonly typedSignal = signal('');
  private readonly querySignal = signal('');
  private readonly selectedRefSignal = signal<RowRef | null>(null);
  private readonly overlaySignal = signal(false);
  /** The box text when the open product was opened (US-59). */
  private readonly rememberedSignal = signal('');
  /** Bumped when another product opens or the product closes — not when a refresh re-points the same one (US-60, US-66). */
  private readonly selectionKeySignal = signal(0);
  private pending: ReturnType<typeof setTimeout> | undefined;

  /** What is in the search box. */
  readonly typed = this.typedSignal.asReadonly();
  /** The search that ran (filters the list). */
  readonly query = this.querySignal.asReadonly();
  /** A search ran while a product is open: the results show over it (US-59). */
  readonly overlayOpen = this.overlaySignal.asReadonly();
  /** Changes only when a different product opens or the product closes. */
  readonly selectionKey = this.selectionKeySignal.asReadonly();

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
  /** The result list shows: on the home screen, or as the overlay over an open product (US-59). */
  readonly listShown = computed(
    () => this.hasQuery() && (this.selectedRefSignal() === null || this.overlaySignal()),
  );
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
        this.overlaySignal.set(false);
        this.rememberedSignal.set('');
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
        this.run(text);
      }, AUTO_SEARCH_DELAY_MS);
    }
  }

  /** Runs `query` at once, any length, and puts it in the box: Enter / Search, or a Data health pick (US-61). */
  setQuery(query: string): void {
    this.cancelPending();
    this.typedSignal.set(query);
    this.run(query);
  }

  /** The clear (×) with no product open: empties the box and the results. */
  clear(): void {
    this.setQuery('');
  }

  /** Sets the box text only (nothing runs): a cleared box waiting for "Discard changes?" (US-59). */
  setBox(text: string): void {
    this.cancelPending();
    this.typedSignal.set(text);
  }

  /** Cancels the overlay: the results go, the product shows, the box gets the remembered text back. */
  cancelOverlay(): void {
    this.cancelPending();
    this.overlaySignal.set(false);
    this.typedSignal.set(this.rememberedSignal());
    this.querySignal.set(this.rememberedSignal());
  }

  /** Puts the remembered text back in the box (a clear that was not confirmed). */
  restoreBox(): void {
    this.setBox(this.rememberedSignal());
  }

  /** A search runs; with a product open its results show as the overlay. */
  private run(text: string): void {
    this.querySignal.set(text);
    if (this.selectedRefSignal() !== null && text.trim() !== '') {
      this.overlaySignal.set(true);
    }
  }

  private cancelPending(): void {
    clearTimeout(this.pending);
    this.pending = undefined;
  }

  /**
   * Opens a product (call through `ProductNavigation`, which asks first when
   * needed). The overlay closes and the box text is remembered; this closes
   * the filter panel (US-70).
   */
  select(ref: RowRef): void {
    if (ref !== this.selectedRefSignal()) {
      this.selectionKeySignal.update((key) => key + 1);
    }
    this.cancelPending();
    this.selectedRefSignal.set(ref);
    this.overlaySignal.set(false);
    this.rememberedSignal.set(this.typedSignal());
    this.panels.closeFilters();
  }

  /** The same product under the ref a refresh gave it (US-60): nothing else changes. */
  repoint(ref: RowRef): void {
    this.selectedRefSignal.set(ref);
  }

  clearSelection(): void {
    if (this.selectedRefSignal() !== null) {
      this.selectionKeySignal.update((key) => key + 1);
    }
    this.selectedRefSignal.set(null);
    this.overlaySignal.set(false);
  }
}
