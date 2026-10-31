import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { ProductSearchStore } from '@core/search/product-search-store';
import { AdjustMode, Proposal, formatDelta, parseAmount, proposeQuantity } from './stock-adjust';
import { StockStatusLabel, deriveStockStatus } from './stock-status';

/**
 * Adjuster state for the selected product (US-15–17). Components set the mode
 * and the typed amount and read the rest; the proposal, its Stock Status and
 * the low-stock warning are computed here with the one rule for each. Resets
 * whenever the selected product changes or the selection clears.
 */
@Injectable({ providedIn: 'root' })
export class StockAdjustStore {
  private readonly search = inject(ProductSearchStore);

  private readonly modeSignal = signal<AdjustMode | null>(null);
  private readonly amountTextSignal = signal('');

  /** Add or Subtract; null until the user chooses (no silent default). */
  readonly mode = this.modeSignal.asReadonly();
  /** The amount exactly as typed. */
  readonly amountText = this.amountTextSignal.asReadonly();

  /** The base quantity: the selected product's MASTER stock qty. */
  readonly current = computed(() => this.search.selected()?.product.stockQty ?? null);
  /** The master's Low Stock Threshold (null when blank). */
  readonly threshold = computed(() => this.search.selected()?.product.lowStockThreshold ?? null);

  /** Null until a mode is chosen and an amount typed; otherwise the proposal or why it is blocked. */
  readonly proposal = computed<Proposal | null>(() => {
    const mode = this.modeSignal();
    const amount = parseAmount(this.amountTextSignal());
    return mode === null || amount === null ? null : proposeQuantity(this.current(), { way: 'amount', mode, amount });
  });

  /** "+15" / "−15" for a valid proposal. */
  readonly deltaText = computed(() => {
    const p = this.proposal();
    return p?.ok ? formatDelta(p.delta) : '';
  });

  /** The Stock Status the new quantity would have — the same rule the writer uses. */
  readonly proposedStatus = computed<StockStatusLabel | null>(() => {
    const p = this.proposal();
    return p?.ok ? deriveStockStatus(p.proposed, this.threshold()) : null;
  });

  /** The new quantity is below a set threshold. */
  readonly lowStockWarning = computed(() => {
    const p = this.proposal();
    const threshold = this.threshold();
    return p?.ok === true && threshold !== null && p.proposed < threshold;
  });

  /** Editable product with a valid proposal: the review step (story B) may open. */
  readonly readyForReview = computed(
    () => this.search.selectedEditability()?.editable === true && this.proposal()?.ok === true,
  );

  constructor() {
    let lastRef = untracked(() => this.search.selected()?.ref ?? null);
    effect(() => {
      const ref = this.search.selected()?.ref ?? null;
      if (ref !== lastRef) {
        lastRef = ref;
        untracked(() => this.reset());
      }
    });
  }

  setMode(mode: AdjustMode): void {
    this.modeSignal.set(mode);
  }

  setAmount(text: string): void {
    this.amountTextSignal.set(text);
  }

  reset(): void {
    this.modeSignal.set(null);
    this.amountTextSignal.set('');
  }
}
