import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { AppConfig } from '@core/config/app-config';
import { ProductSearchStore } from '@core/search/product-search-store';
import { ApprovedChange, InvalidChangeError, RowChange, approve } from '@core/sheets/approval';
import { SheetsStore } from '@core/sheets/sheets-store';
import { SheetWritten, SheetsWriter, WriteResult } from '@core/sheets/sheets-writer';
import { StockAdjustStore } from './stock-adjust-store';
import { StockStatusLabel } from './stock-status';

export type ReviewStep = 'editing' | 'reviewing' | 'saving' | 'conflict' | 'partial' | 'failed';

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

/** A half-done linked save that Retry can finish (US-34). */
interface PendingRetry {
  /** The unwritten rows of the user's original approval. */
  readonly approved: ApprovedChange;
  readonly productName: string;
  readonly proposed: number;
  /** Labels of the sheets already written and confirmed. */
  readonly writtenLabels: readonly string[];
}

/**
 * Review → approve → write for a quantity change (US-18, 19, 33, 35, 20). The
 * ONLY caller of `approve()` for stock changes. One approval covers both rows
 * of a linked product; the writer checks both before writing either. After a
 * write the confirmed values go into the loaded data; on success the selection
 * clears for the next product. A partial save can be finished with Retry while
 * the panel is open (US-34); closing it leaves the product out of sync.
 */
@Injectable({ providedIn: 'root' })
export class StockReviewStore {
  private readonly adjust = inject(StockAdjustStore);
  private readonly search = inject(ProductSearchStore);
  private readonly sheets = inject(SheetsStore);
  private readonly writer = inject(SheetsWriter);
  private readonly config = inject(AppConfig);

  private readonly stepSignal = signal<ReviewStep>('editing');
  private readonly messageSignal = signal<string | null>(null);
  private readonly noticeSignal = signal<string | null>(null);
  private readonly pendingSignal = signal<PendingRetry | null>(null);

  readonly step = this.stepSignal.asReadonly();
  /** Why the last approval did not fully succeed (conflict / partial / failed), or null. */
  readonly message = this.messageSignal.asReadonly();
  /** Success message for the toast, or null. Survives the selection clearing. */
  readonly notice = this.noticeSignal.asReadonly();
  /** The sheet(s) Retry would finish ("Dr Trust"), or null when there is nothing to retry. */
  readonly retryLabel = computed(() => {
    const pending = this.pendingSignal();
    return pending === null ? null : this.labelsOf(pending.approved).join(' and ');
  });

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
        untracked(() => this.toEditing());
      }
    });
  }

  /** Opens the review when the proposal is valid for an editable product. */
  open(): void {
    if (this.adjust.readyForReview() && this.stepSignal() !== 'saving') {
      this.messageSignal.set(null);
      this.stepSignal.set('reviewing');
    }
  }

  /** Back to the adjuster (not while saving). */
  back(): void {
    if (this.stepSignal() !== 'saving') {
      this.toEditing();
    }
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
    const step = this.stepSignal();
    if (step !== 'reviewing' && step !== 'failed') {
      return;
    }
    const selected = this.search.selected();
    const proposal = this.adjust.proposal();
    if (selected === null || proposal === null || !proposal.ok || this.search.selectedEditability()?.editable !== true) {
      this.toEditing();
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
    let approved;
    try {
      approved = approve(...rows);
    } catch (error) {
      if (error instanceof InvalidChangeError) {
        this.messageSignal.set(error.message);
        this.stepSignal.set('failed');
        return;
      }
      throw error;
    }

    this.messageSignal.set(null);
    this.stepSignal.set('saving');
    const result = await this.writer.write(approved);
    this.handle(result, selected.product.productName, proposal.proposed);
  }

  /**
   * Finishes a partial save: writes only the rows not yet written, from the
   * original approval (same absolute values; Master is never rewritten). Works
   * only from the partial step, so a double click writes once.
   */
  async retry(): Promise<void> {
    const pending = this.pendingSignal();
    if (this.stepSignal() !== 'partial' || pending === null) {
      return;
    }
    this.messageSignal.set(null);
    this.stepSignal.set('saving');
    const result = await this.writer.write(pending.approved);
    if (result.kind === 'written') {
      this.applyWritten(result.sheets);
      this.succeed(pending.productName, pending.proposed, [...pending.writtenLabels, ...labelsOf(result.sheets)]);
      return;
    }
    // An earlier sheet is already written: whatever happened now, it is still partial.
    let next = pending;
    if (result.kind === 'partial') {
      this.applyWritten(result.written);
      next = {
        ...pending,
        approved: result.remaining,
        writtenLabels: [...pending.writtenLabels, ...labelsOf(result.written)],
      };
    }
    const reason = result.kind === 'conflict' ? `${result.sheet.label} changed while saving.` : result.error.message;
    this.toPartial(
      next,
      `${next.writtenLabels.join(' and ')} was updated to ${next.proposed}. ${this.labelsOf(next.approved).join(' and ')} still not updated: ${reason}`,
    );
  }

  private handle(result: WriteResult, productName: string, proposed: number): void {
    switch (result.kind) {
      case 'written':
        this.applyWritten(result.sheets);
        this.succeed(productName, proposed, labelsOf(result.sheets));
        return;
      case 'conflict':
        this.sheets.applyRow(result.ref, result.current.product, result.current.issues);
        this.messageSignal.set(
          `The stock changed to ${result.current.product.stockQty ?? 'an invalid value'} since you reviewed. Nothing was saved.`,
        );
        this.stepSignal.set('conflict');
        return;
      case 'partial': {
        this.applyWritten(result.written);
        // Master now holds the new qty: clear the amount so it cannot be applied twice.
        this.adjust.reset();
        const writtenLabels = labelsOf(result.written);
        this.toPartial(
          { approved: result.remaining, productName, proposed, writtenLabels },
          `${writtenLabels.join(' and ')} was updated to ${proposed}. ${result.error.sheetLabel} was not updated: ${result.error.message}`,
        );
        return;
      }
      case 'failed':
        this.messageSignal.set(result.error.message);
        this.stepSignal.set('failed');
        return;
    }
  }

  private applyWritten(sheets: readonly SheetWritten[]): void {
    sheets.forEach((s) => this.sheets.applyRow(s.ref, s.product));
  }

  private succeed(productName: string, proposed: number, labels: readonly string[]): void {
    this.noticeSignal.set(`${productName} is now ${proposed} (${labels.join(' and ')}).`);
    this.adjust.reset();
    this.search.clearSelection(); // the selection effect returns the review to editing
    this.toEditing();
  }

  private toPartial(pending: PendingRetry, message: string): void {
    this.pendingSignal.set(pending);
    this.messageSignal.set(message);
    this.stepSignal.set('partial');
  }

  private labelsOf(approved: ApprovedChange): string[] {
    return approved.rows.map((row) => this.config.sheet(row.target.sheet).label);
  }

  private toEditing(): void {
    this.pendingSignal.set(null);
    this.messageSignal.set(null);
    this.stepSignal.set('editing');
  }
}

function labelsOf(sheets: readonly SheetWritten[]): string[] {
  return sheets.map((s) => s.sheet.label);
}
