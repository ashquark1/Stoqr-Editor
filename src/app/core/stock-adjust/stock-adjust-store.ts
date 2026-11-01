import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { ProductSearchStore } from '@core/search/product-search-store';
import { AdjustMode, Proposal, formatDelta, parseAmount, proposeQuantity } from './stock-adjust';
import { StockStatusLabel, deriveStockStatus } from './stock-status';

/** Which way the stock is being changed (CR-04): an amount with a sign, or a new total. */
export type AdjustWay = 'amount' | 'total';

/**
 * Adjuster state for the selected product (US-15–17, US-64). Components set
 * the sign, the typed amount or the typed new total, and read the rest; the
 * proposal, its Stock Status and the low-stock warning are computed here with
 * the one rule for each. Typing a new total clears the amount and the sign;
 * typing an amount or choosing a sign clears the total. Resets whenever the
 * selected product changes or the selection clears.
 */
@Injectable({ providedIn: 'root' })
export class StockAdjustStore {
  private readonly search = inject(ProductSearchStore);

  private readonly modeSignal = signal<AdjustMode | null>(null);
  private readonly amountTextSignal = signal('');
  private readonly totalTextSignal = signal('');

  /** Add or Subtract; null until the user chooses (no silent default). */
  readonly mode = this.modeSignal.asReadonly();
  /** The amount exactly as typed. */
  readonly amountText = this.amountTextSignal.asReadonly();
  /** The new total exactly as typed. */
  readonly totalText = this.totalTextSignal.asReadonly();

  /** The total when its box has text, else the amount. */
  readonly way = computed<AdjustWay>(() => (this.totalTextSignal().trim() !== '' ? 'total' : 'amount'));

  /** Anything typed or a sign chosen: unsaved work for `ProductNavigation`. */
  readonly hasEntry = computed(
    () => this.modeSignal() !== null || this.amountTextSignal().trim() !== '' || this.totalTextSignal().trim() !== '',
  );

  /** The base quantity: the selected product's MASTER stock qty. */
  readonly current = computed(() => this.search.selected()?.product.stockQty ?? null);
  /** The master's Low Stock Threshold (null when blank). */
  readonly threshold = computed(() => this.search.selected()?.product.lowStockThreshold ?? null);

  /**
   * Null until there is something to propose (an amount needs a sign);
   * otherwise the proposal or why it is blocked — from the one function.
   */
  readonly proposal = computed<Proposal | null>(() => {
    if (this.way() === 'total') {
      const total = parseAmount(this.totalTextSignal());
      return total === null ? null : proposeQuantity(this.current(), { way: 'total', total });
    }
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

  /** Editable product with a valid proposal: Apply may write (US-64). */
  readonly applyReady = computed(
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

  /** Choosing a sign uses the amount way, so the new total clears. */
  setMode(mode: AdjustMode): void {
    this.modeSignal.set(mode);
    this.totalTextSignal.set('');
  }

  /** Typing an amount clears the new total (writes only; safe to call from an effect). */
  setAmount(text: string): void {
    this.amountTextSignal.set(text);
    if (text.trim() !== '') {
      this.totalTextSignal.set('');
    }
  }

  /** Typing a new total clears the amount and the sign (writes only). */
  setTotal(text: string): void {
    this.totalTextSignal.set(text);
    if (text.trim() !== '') {
      this.amountTextSignal.set('');
      this.modeSignal.set(null);
    }
  }

  reset(): void {
    this.modeSignal.set(null);
    this.amountTextSignal.set('');
    this.totalTextSignal.set('');
  }
}
