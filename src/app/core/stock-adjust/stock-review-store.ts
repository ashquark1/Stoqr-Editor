import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { AppConfig } from '@core/config/app-config';
import { ProductSearchStore } from '@core/search/product-search-store';
import { RowChange, approve } from '@core/sheets/approval';
import { ReviewFlow } from '@core/sheets/review-flow';
import { StockAdjustStore } from './stock-adjust-store';

export type { ReviewStep } from '@core/sheets/review-flow';

/** A confirmed stock save (US-64): what the saved strip shows, and the base for Undo (US-65). */
export interface StockSaved {
  readonly productName: string;
  /** Master's quantity before the save. */
  readonly previous: number;
  /** The quantity now in every sheet written. */
  readonly saved: number;
  /** "Master and Dr Trust" or "Master". */
  readonly sheetsText: string;
  /** What Dr Trust held when it differed from Master (it was overwritten), else null. */
  readonly drTrustHad: number | null;
  /** True when a Retry finished a half-done save (no Undo for it). */
  readonly retried: boolean;
}

/** What a stock save's outcomes need. */
interface StockSave {
  readonly productName: string;
  readonly previous: number;
  readonly proposed: number;
  readonly drTrustHad: number | null;
}

/**
 * Apply → write for a quantity change (US-64, CR-04: no review step). The
 * ONLY caller of `approve()` for stock changes. One approval covers both rows
 * of a linked product; the writer checks both before writing either. After a
 * write the confirmed values go into the loaded data and the product stays
 * open. Outcomes are state: saving, saved, conflict, failed, half saved
 * (Retry from the original approval, US-34). The steps are the shared
 * `ReviewFlow`, started from editing, conflict or failed.
 */
@Injectable({ providedIn: 'root' })
export class StockReviewStore {
  private readonly adjust = inject(StockAdjustStore);
  private readonly search = inject(ProductSearchStore);
  private readonly config = inject(AppConfig);

  private readonly noticeSignal = signal<string | null>(null);
  private readonly savedSignal = signal<StockSaved | null>(null);

  private readonly flow = new ReviewFlow<StockSave>(
    {
      written: (save, labels, retried) => {
        this.savedSignal.set({
          productName: save.productName,
          previous: save.previous,
          saved: save.proposed,
          sheetsText: labels.join(' and '),
          drTrustHad: save.drTrustHad,
          retried,
        });
        this.noticeSignal.set(`${save.productName} is now ${save.proposed} (${labels.join(' and ')}).`);
        this.adjust.reset();
      },
      conflictMessage: (result) =>
        `The stock changed to ${result.current.product.stockQty ?? 'an invalid value'} since you opened this product. Nothing was saved.`,
      // The entry was made against the old quantity.
      conflict: () => this.adjust.reset(),
      partialMessage: ({ proposed }, writtenLabels, notUpdated, reason, retried) =>
        `${writtenLabels.join(' and ')} was updated to ${proposed}. ${notUpdated} ${retried ? 'still not updated' : 'was not updated'}: ${reason}`,
      // Master now holds the new qty: clear the entry so it cannot be applied twice.
      partial: () => this.adjust.reset(),
    },
    ['editing', 'conflict', 'failed'],
  );

  readonly step = this.flow.step;
  /** Why the last Apply did not fully succeed (conflict / partial / failed), or null. */
  readonly message = this.flow.message;
  /** The last confirmed save, or null. */
  readonly saved = this.savedSignal.asReadonly();
  /** Success message for the toast (until US-76), or null. */
  readonly notice = this.noticeSignal.asReadonly();
  /** The sheet(s) Retry would finish ("Dr Trust"), or null when there is nothing to retry. */
  readonly retryLabel = this.flow.retryLabel;
  /** Saving, or half saved: the adjuster and the pencil are off until Retry or Close. */
  readonly locked = computed(() => this.step() === 'saving' || this.step() === 'partial');

  constructor() {
    let lastRef = untracked(() => this.search.selected()?.ref ?? null);
    effect(() => {
      const ref = this.search.selected()?.ref ?? null;
      if (ref !== lastRef) {
        lastRef = ref;
        untracked(() => this.close());
      }
    });
  }

  /**
   * The user's explicit tap (Apply, or Enter in a box). Writes only for a
   * valid entry on an editable product, and only from editing, conflict or
   * failed — so a double tap writes once and Try again repeats the same Apply.
   */
  async apply(): Promise<void> {
    if (!this.flow.canSave() || !this.adjust.applyReady()) {
      return;
    }
    const selected = this.search.selected();
    const proposal = this.adjust.proposal();
    if (selected === null || proposal === null || !proposal.ok) {
      return;
    }
    this.savedSignal.set(null);

    // One approval for both rows of a linked product: the same absolute quantity in each.
    // Master is guarded by the qty the user saw; Dr Trust's is overwritten by design (not checked).
    const link = this.search.selectedLink();
    const rows: RowChange[] = [
      { target: selected.ref, reviewed: { stockQty: proposal.current }, changes: { stockQty: proposal.proposed } },
    ];
    if (link !== null) {
      rows.push({ target: link.ref, reviewed: {}, changes: { stockQty: proposal.proposed } });
    }
    const drTrustQty = link?.product.stockQty ?? null;
    await this.flow.save(() => approve(...rows), {
      productName: selected.product.productName,
      previous: proposal.current,
      proposed: proposal.proposed,
      drTrustHad: link !== null && drTrustQty !== proposal.current ? drTrustQty : null,
    });
  }

  /**
   * Finishes a half-done save: writes only the rows not yet written, from the
   * original approval (Master is never rewritten). Once per tap.
   */
  retry(): Promise<void> {
    return this.flow.retry();
  }

  /**
   * Dismisses a conflict or failure, or abandons a half-done save (the product
   * stays Out of sync), and clears the saved result. Not while saving.
   */
  close(): void {
    if (this.step() !== 'saving') {
      this.flow.reset();
      this.savedSignal.set(null);
    }
  }

  clearNotice(): void {
    this.noticeSignal.set(null);
  }
}
