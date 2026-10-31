import { Injectable, computed, inject, signal } from '@angular/core';

import { DetailsReviewStore } from '@core/details/details-review-store';
import { DetailsStore } from '@core/details/details-store';
import { PanelStore } from '@core/layout/panel-store';
import { FilterStore } from '@core/search/filter-store';
import { ProductSearchStore } from '@core/search/product-search-store';
import { RowRef } from '@core/sheets/row-ref';
import { SheetsStore } from '@core/sheets/sheets-store';
import { StockAdjustStore } from '@core/stock-adjust/stock-adjust-store';
import { StockReviewStore } from '@core/stock-adjust/stock-review-store';

/** The message when Refresh finds the open product gone (US-60). */
export const PRODUCT_GONE = 'This product is no longer in the sheet.';

/** A step waiting on "Discard changes?": what to do on Discard, and on Keep editing. */
interface PendingLeave {
  readonly leave: () => void;
  readonly stay?: () => void;
}

/**
 * Moving between products safely (US-59, US-60, US-61, US-66): opening one
 * from the results or Data health, closing it, clearing the search box over
 * it, refreshing it, and opening or closing its details form. Anything that
 * would drop unsaved changes asks "Discard changes?" first (one question for
 * the whole page). Unsaved changes are details edits, a typed adjuster amount
 * or a chosen Add/Subtract (owner rule, so Refresh and the search agree).
 * Nothing moves while a save runs: its result must never be lost.
 */
@Injectable({ providedIn: 'root' })
export class ProductNavigation {
  private readonly search = inject(ProductSearchStore);
  private readonly details = inject(DetailsStore);
  private readonly adjust = inject(StockAdjustStore);
  private readonly stockReview = inject(StockReviewStore);
  private readonly detailsReview = inject(DetailsReviewStore);
  private readonly filters = inject(FilterStore);
  private readonly panels = inject(PanelStore);
  private readonly sheets = inject(SheetsStore);

  private readonly pendingSignal = signal<PendingLeave | null>(null);
  private readonly noticeSignal = signal<string | null>(null);

  /** A stock or details save is running. */
  readonly saving = computed(
    () => this.stockReview.step() === 'saving' || this.detailsReview.step() === 'saving',
  );

  /** Details edits, a typed adjuster amount or a chosen sign. */
  readonly unsaved = computed(
    () => this.details.hasChanges() || this.adjust.mode() !== null || this.adjust.amountText().trim() !== '',
  );

  /** True while "Discard changes?" waits for an answer. */
  readonly leavePending = computed(() => this.pendingSignal() !== null);

  /** "This product is no longer in the sheet." after a refresh, or null. */
  readonly notice = this.noticeSignal.asReadonly();

  /** Refresh may run: not while one runs or a save runs (US-60). */
  readonly refreshAvailable = computed(() => !this.sheets.refreshing() && !this.saving());

  /** Answer to "Discard changes?": go ahead (each step resets what it drops). */
  discard(): void {
    const pending = this.pendingSignal();
    this.pendingSignal.set(null);
    pending?.leave();
  }

  /** Answer to "Discard changes?": stay, nothing changes. */
  keepEditing(): void {
    const pending = this.pendingSignal();
    this.pendingSignal.set(null);
    pending?.stay?.();
  }

  clearNotice(): void {
    this.noticeSignal.set(null);
  }

  /** A result was chosen (home list or overlay): opens it in place of the open product. */
  open(ref: RowRef): void {
    if (this.saving()) {
      return;
    }
    if (ref === this.search.selected()?.ref) {
      this.search.select(ref); // the same product: just close the overlay, keep the work
      return;
    }
    this.ask(() => this.search.select(ref));
  }

  /**
   * A Master row picked in Data health (US-61): filters back to their defaults,
   * the panel closes, its SKU is searched at once and the product opens.
   */
  pickFromHealth(ref: RowRef): void {
    if (this.saving()) {
      return;
    }
    this.ask(() => {
      const sku = this.sheets.master().find((row) => row.ref === ref)?.product.sku ?? '';
      this.filters.reset();
      this.panels.closeHealth();
      this.search.setQuery(String(sku));
      this.dropWork();
      this.search.select(ref);
    });
  }

  /** The box changed. Emptying it is the same as the clear (×); anything else is the search's rule. */
  setTyped(text: string): void {
    if (text === this.search.typed()) {
      return;
    }
    if (text.trim() === '' && this.search.selected() !== null) {
      this.search.setBox(text);
      this.clearBox();
      return;
    }
    this.search.setTyped(text);
  }

  /** Enter / Search: runs the box's text now; an empty box is a clear. */
  submit(text: string): void {
    if (text.trim() === '' && this.search.selected() !== null) {
      this.search.setBox(text);
      this.clearBox();
      return;
    }
    this.search.setQuery(text);
  }

  /**
   * The clear (×), or the box emptied (US-59). Overlay showing: cancel the new
   * search (product shows, box text back). No overlay: close the product and
   * show the start state — asking first, and putting the text back on "no".
   */
  clearBox(): void {
    if (this.search.selected() === null) {
      this.search.clear();
      return;
    }
    if (this.search.overlayOpen()) {
      this.search.cancelOverlay();
      return;
    }
    if (this.saving()) {
      this.search.restoreBox();
      return;
    }
    this.ask(
      () => {
        this.dropWork();
        this.search.clearSelection();
        this.search.clear();
      },
      () => this.search.restoreBox(),
    );
  }

  /** Closes the open product, keeping the search (the list shows again). */
  closeProduct(): void {
    if (this.saving()) {
      return;
    }
    this.ask(() => {
      this.dropWork();
      this.search.clearSelection();
    });
  }

  /**
   * Refresh (US-60): asks first when there is work to lose; then reloads both
   * sheets. The open product is found again by its row and shows fresh values;
   * the adjuster, the details edits and any review start again (the form stays
   * open). Gone → it closes with a message. A failed refresh changes nothing.
   */
  refresh(): void {
    if (!this.refreshAvailable()) {
      return;
    }
    this.ask(() => void this.reload());
  }

  /** Opens the details form; a typed adjuster amount and sign are dropped silently (A-UI-30). */
  openDetails(): void {
    if (this.saving()) {
      return;
    }
    this.adjust.reset();
    this.details.openForm();
  }

  /** Cancel / leaving the form (US-66): always closes it, asking first when details are edited. */
  closeDetails(): void {
    if (this.details.hasChanges()) {
      this.pendingSignal.set({ leave: () => this.details.closeForm() });
    } else {
      this.details.closeForm();
    }
  }

  private async reload(): Promise<void> {
    const open = this.search.selected()?.ref ?? null;
    const result = await this.sheets.refresh(open, (ref) => {
      // Same step as the new data, so the open product never blinks out.
      if (ref !== null) {
        this.search.repoint(ref);
      } else {
        this.search.clearSelection();
        this.noticeSignal.set(PRODUCT_GONE);
      }
    });
    if (result === 'refreshed' && open !== null) {
      // The new ref already resets the adjuster, the edits and the reviews; be explicit.
      this.dropWork();
    }
  }

  /** Runs `leave` now when nothing would be lost; otherwise asks "Discard changes?" first. */
  private ask(leave: () => void, stay?: () => void): void {
    if (this.unsaved()) {
      this.pendingSignal.set({ leave, stay });
    } else {
      leave();
    }
  }

  /** Drops the adjuster entry and the details edits (the person agreed, or nothing was there). */
  private dropWork(): void {
    this.adjust.reset();
    this.details.reset();
  }
}
