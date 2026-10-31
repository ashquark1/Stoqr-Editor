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

/** What a stock save's outcomes need. `undo`: this save writes back the previous quantity (US-65). */
interface StockSave {
  readonly kind: 'apply' | 'undo';
  readonly productName: string;
  readonly previous: number;
  readonly proposed: number;
  readonly drTrustHad: number | null;
}

/** How long Undo is offered after a save, and how long "restored" shows (US-65). */
export const UNDO_WINDOW_MS = 10_000;
export const RESTORED_MS = 5_000;

/**
 * Apply → write for a quantity change (US-64, CR-04: no review step), and
 * Undo of the last one (US-65). The ONLY caller of `approve()` for stock
 * changes. One approval covers both rows of a linked product; the writer
 * checks both before writing either. After a write the confirmed values go
 * into the loaded data and the product stays open. Outcomes are state:
 * saving, saved (Undo for 10 s), restored (5 s), conflict / refused, failed,
 * half saved (Retry from the original approval, US-34). The steps are the
 * shared `ReviewFlow`, started from editing, conflict or failed.
 */
@Injectable({ providedIn: 'root' })
export class StockReviewStore {
  private readonly adjust = inject(StockAdjustStore);
  private readonly search = inject(ProductSearchStore);
  private readonly config = inject(AppConfig);

  private readonly noticeSignal = signal<string | null>(null);
  private readonly savedSignal = signal<StockSaved | null>(null);
  private readonly undoAvailableSignal = signal(false);
  private readonly restoredSignal = signal<number | null>(null);
  /** What Try again repeats after a failure: the last Apply, or the last Undo. */
  private readonly lastActionSignal = signal<'apply' | 'undo'>('apply');
  /** The save an Undo reverses, kept for Try again. */
  private undoSource: StockSaved | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  private readonly flow = new ReviewFlow<StockSave>(
    {
      written: (save, labels, retried) => {
        if (save.kind === 'undo') {
          // Undo is final: no Undo of the undo.
          this.restoredSignal.set(save.proposed);
          this.noticeSignal.set(
            `${save.productName} restored to ${save.proposed} (${labels.join(' and ')}).`,
          );
          this.startTimer(RESTORED_MS);
          return;
        }
        this.savedSignal.set({
          productName: save.productName,
          previous: save.previous,
          saved: save.proposed,
          sheetsText: labels.join(' and '),
          drTrustHad: save.drTrustHad,
          retried,
        });
        // No Undo after a half-done save, even once Retry finished it.
        this.undoAvailableSignal.set(!retried);
        this.noticeSignal.set(
          `${save.productName} is now ${save.proposed} (${labels.join(' and ')}).`,
        );
        this.adjust.reset();
        this.startTimer(UNDO_WINDOW_MS);
      },
      conflictMessage: (result, save) => {
        const now = result.current.product.stockQty ?? 'an invalid value';
        return save.kind === 'undo'
          ? `Can't undo: the stock is now ${now}, changed by someone else. Nothing was saved.`
          : `The stock changed to ${now} since you opened this product. Nothing was saved.`;
      },
      // An Apply entry was made against the old quantity; an Undo leaves any new entry alone.
      conflict: (save) => {
        if (save.kind === 'apply') {
          this.adjust.reset();
        }
      },
      partialMessage: ({ proposed }, writtenLabels, notUpdated, reason, retried) =>
        `${writtenLabels.join(' and ')} was updated to ${proposed}. ${notUpdated} ${retried ? 'still not updated' : 'was not updated'}: ${reason}`,
      // Master now holds the new qty: clear an Apply entry so it cannot be applied twice.
      partial: (save) => {
        if (save.kind === 'apply') {
          this.adjust.reset();
        }
      },
    },
    ['editing', 'conflict', 'failed'],
  );

  readonly step = this.flow.step;
  /** Why the last Apply did not fully succeed (conflict / partial / failed), or null. */
  readonly message = this.flow.message;
  /** The last confirmed save, or null (cleared after 10 s). */
  readonly saved = this.savedSignal.asReadonly();
  /** Undo is offered for the last save (US-65). */
  readonly undoAvailable = computed(() => this.undoAvailableSignal() && this.step() === 'editing');
  /** "Stock restored to N." after an Undo (for 5 s), or null. */
  readonly restored = this.restoredSignal.asReadonly();
  /** An Undo is being written. */
  readonly undoing = computed(() => this.step() === 'saving' && this.lastActionSignal() === 'undo');
  /** What the last failure's Try again repeats. */
  readonly lastAction = this.lastActionSignal.asReadonly();
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
    this.clearResults();
    this.lastActionSignal.set('apply');

    // One approval for both rows of a linked product: the same absolute quantity in each.
    // Master is guarded by the qty the user saw; Dr Trust's is overwritten by design (not checked).
    const link = this.search.selectedLink();
    const rows: RowChange[] = [
      {
        target: selected.ref,
        reviewed: { stockQty: proposal.current },
        changes: { stockQty: proposal.proposed },
      },
    ];
    if (link !== null) {
      rows.push({ target: link.ref, reviewed: {}, changes: { stockQty: proposal.proposed } });
    }
    const drTrustQty = link?.product.stockQty ?? null;
    await this.flow.save(() => approve(...rows), {
      kind: 'apply',
      productName: selected.product.productName,
      previous: proposal.current,
      proposed: proposal.proposed,
      drTrustHad: link !== null && drTrustQty !== proposal.current ? drTrustQty : null,
    });
  }

  /**
   * The user's explicit Undo tap (US-65): writes the previous quantity back as
   * a NEW absolute save to the same sheets, only while Master still holds the
   * quantity just saved (otherwise refused, nothing written). Final: an undo
   * has no Undo of its own.
   */
  async undo(): Promise<void> {
    const source = this.savedSignal();
    if (!this.undoAvailable() || source === null) {
      return;
    }
    this.undoSource = source;
    await this.writeUndo(source);
  }

  /** Try again after a failure with nothing written: repeats the last Apply or the last Undo. */
  async tryAgain(): Promise<void> {
    if (this.step() !== 'failed') {
      return;
    }
    if (this.lastActionSignal() === 'undo' && this.undoSource !== null) {
      await this.writeUndo(this.undoSource);
    } else {
      await this.apply();
    }
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
   * stays Out of sync), and ends any saved / restored result and the Undo
   * offer. Not while saving.
   */
  close(): void {
    if (this.step() !== 'saving') {
      this.flow.reset();
      this.clearResults();
      this.undoSource = null;
    }
  }

  clearNotice(): void {
    this.noticeSignal.set(null);
  }

  private async writeUndo(source: StockSaved): Promise<void> {
    const selected = this.search.selected();
    if (
      !this.flow.canSave() ||
      selected === null ||
      this.search.selectedEditability()?.editable !== true
    ) {
      return;
    }
    this.clearResults();
    this.lastActionSignal.set('undo');
    const link = this.search.selectedLink();
    const rows: RowChange[] = [
      {
        target: selected.ref,
        reviewed: { stockQty: source.saved },
        changes: { stockQty: source.previous },
      },
    ];
    if (link !== null) {
      rows.push({ target: link.ref, reviewed: {}, changes: { stockQty: source.previous } });
    }
    await this.flow.save(() => approve(...rows), {
      kind: 'undo',
      productName: source.productName,
      previous: source.saved,
      proposed: source.previous,
      drTrustHad: null,
    });
  }

  /** Ends the saved / restored result, the Undo offer and its timer. */
  private clearResults(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.savedSignal.set(null);
    this.restoredSignal.set(null);
    this.undoAvailableSignal.set(false);
  }

  private startTimer(ms: number): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.savedSignal.set(null);
      this.restoredSignal.set(null);
      this.undoAvailableSignal.set(false);
    }, ms);
  }
}
