import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { AppConfig } from '@core/config/app-config';
import { ProductSearchStore } from '@core/search/product-search-store';
import { RowChange, approve } from '@core/sheets/approval';
import { ReviewFlow } from '@core/sheets/review-flow';
import { StockAdjustStore } from './stock-adjust-store';
import { StockStatusLabel } from './stock-status';

export type { ReviewStep } from '@core/sheets/review-flow';

/** What the review panel shows; null when there is no valid proposal. */
export interface ReviewSummary {
  readonly productName: string;
  /** "Master and Dr Trust" or "Master". */
  readonly sheetsText: string;
  readonly current: number;
  readonly deltaText: string;
  readonly proposed: number;
  readonly status: StockStatusLabel | null;
  readonly lowStockWarning: boolean;
  /** Shown when a linked product's Dr Trust qty differs (it will be overwritten, US-35). */
  readonly drTrustNote: string | null;
}

/** What a stock save's messages need. */
interface StockSave {
  readonly productName: string;
  readonly proposed: number;
}

/**
 * Review → approve → write for a quantity change (US-18, 19, 33, 35, 20). The
 * ONLY caller of `approve()` for stock changes. One approval covers both rows
 * of a linked product; the writer checks both before writing either. After a
 * write the confirmed values go into the loaded data; on success the selection
 * clears for the next product. A partial save can be finished with Retry while
 * the panel is open (US-34); closing it leaves the product out of sync. The
 * steps themselves are the shared `ReviewFlow`.
 */
@Injectable({ providedIn: 'root' })
export class StockReviewStore {
  private readonly adjust = inject(StockAdjustStore);
  private readonly search = inject(ProductSearchStore);
  private readonly config = inject(AppConfig);

  private readonly noticeSignal = signal<string | null>(null);

  private readonly flow = new ReviewFlow<StockSave>({
    written: ({ productName, proposed }, labels) => {
      this.noticeSignal.set(`${productName} is now ${proposed} (${labels.join(' and ')}).`);
      this.adjust.reset();
      this.search.clearSelection(); // the selection effect returns the review to editing
    },
    conflictMessage: (result) =>
      `The stock changed to ${result.current.product.stockQty ?? 'an invalid value'} since you reviewed. Nothing was saved.`,
    partialMessage: ({ proposed }, writtenLabels, notUpdated, reason, retried) =>
      `${writtenLabels.join(' and ')} was updated to ${proposed}. ${notUpdated} ${retried ? 'still not updated' : 'was not updated'}: ${reason}`,
    // Master now holds the new qty: clear the amount so it cannot be applied twice.
    partial: () => this.adjust.reset(),
  });

  readonly step = this.flow.step;
  /** Why the last approval did not fully succeed (conflict / partial / failed), or null. */
  readonly message = this.flow.message;
  /** Success message for the toast, or null. Survives the selection clearing. */
  readonly notice = this.noticeSignal.asReadonly();
  /** The sheet(s) Retry would finish ("Dr Trust"), or null when there is nothing to retry. */
  readonly retryLabel = this.flow.retryLabel;

  readonly review = computed<ReviewSummary | null>(() => {
    const proposal = this.adjust.proposal();
    const selected = this.search.selected();
    if (proposal === null || !proposal.ok || selected === null) {
      return null;
    }
    const link = this.search.selectedLink();
    const masterLabel = this.config.sheet('master').label;
    const drTrustLabel = this.config.sheet('dr-trust').label;
    const drTrustQty = link?.product.stockQty ?? null;
    return {
      productName: selected.product.productName,
      sheetsText: link ? `${masterLabel} and ${drTrustLabel}` : masterLabel,
      current: proposal.current,
      deltaText: this.adjust.deltaText(),
      proposed: proposal.proposed,
      status: this.adjust.proposedStatus(),
      lowStockWarning: this.adjust.lowStockWarning(),
      drTrustNote:
        link !== null && this.search.drTrustQtyDiffers()
          ? `${drTrustLabel} currently has ${drTrustQty ?? 'no valid quantity'}; it will be set to ${proposal.proposed}.`
          : null,
    };
  });

  constructor() {
    let lastRef = untracked(() => this.search.selected()?.ref ?? null);
    effect(() => {
      const ref = this.search.selected()?.ref ?? null;
      if (ref !== lastRef) {
        lastRef = ref;
        untracked(() => this.flow.reset());
      }
    });
  }

  /** Opens the review when the proposal is valid for an editable product. */
  open(): void {
    if (this.adjust.readyForReview()) {
      this.flow.open();
    }
  }

  /** Back to the adjuster (not while saving). */
  back(): void {
    this.flow.back();
  }

  clearNotice(): void {
    this.noticeSignal.set(null);
  }

  /**
   * The user's explicit approval. Works only from the review (or after a
   * failure with nothing written) and only for an editable product, so a
   * double click cannot write twice.
   */
  async approve(): Promise<void> {
    if (!this.flow.canSave()) {
      return;
    }
    const selected = this.search.selected();
    const proposal = this.adjust.proposal();
    if (selected === null || proposal === null || !proposal.ok || this.search.selectedEditability()?.editable !== true) {
      this.flow.reset();
      return;
    }

    // One approval for both rows of a linked product: the same absolute quantity in each.
    // Master's reviewed qty is re-checked; Dr Trust's is overwritten by design (not checked).
    const link = this.search.selectedLink();
    const rows: RowChange[] = [
      { target: selected.ref, reviewed: { stockQty: proposal.current }, changes: { stockQty: proposal.proposed } },
    ];
    if (link !== null) {
      rows.push({ target: link.ref, reviewed: {}, changes: { stockQty: proposal.proposed } });
    }
    await this.flow.save(() => approve(...rows), {
      productName: selected.product.productName,
      proposed: proposal.proposed,
    });
  }

  /**
   * Finishes a partial save: writes only the rows not yet written, from the
   * original approval (same absolute values; Master is never rewritten). Works
   * only from the partial step, so a double click writes once.
   */
  retry(): Promise<void> {
    return this.flow.retry();
  }
}
