import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { StockAdjustStore } from '@core/stock-adjust/stock-adjust-store';
import { StockReviewStore } from '@core/stock-adjust/stock-review-store';
import { Badge } from '@shared/ui/badge/badge';
import { StoqrTooltip } from '@shared/ui/tooltip/tooltip';

/**
 * Change stock by an amount (+ / −) or set a new total, with a live preview,
 * then one Apply tap (US-64, US-75; Enter in either box too). Every value and
 * result lives in `StockAdjustStore`; the write is `StockReviewStore.apply()`.
 * The boxes reach the store through their `input` events (AI_CONTRACT: no
 * effect forwarding input); this component only renders and forwards.
 */
@Component({
  selector: 'app-quantity-adjuster',
  imports: [Badge, ReactiveFormsModule, StoqrTooltip],
  templateUrl: './quantity-adjuster.html',
  styleUrl: './quantity-adjuster.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuantityAdjuster {
  protected readonly adjust = inject(StockAdjustStore);
  protected readonly review = inject(StockReviewStore);

  protected readonly amountControl = new FormControl(this.adjust.amountText(), { nonNullable: true });
  protected readonly totalControl = new FormControl(this.adjust.totalText(), { nonNullable: true });

  /** The way not in use is greyed out: the total is in use, or an amount / sign is. */
  protected readonly dimAmount = computed(() => this.adjust.way() === 'total');
  protected readonly dimTotal = computed(() => this.adjust.way() === 'amount' && this.adjust.hasEntry());

  /** Which box a red message belongs to (for `aria-describedby`), or null. */
  protected readonly errorOn = computed(() => {
    const proposal = this.adjust.proposal();
    return proposal !== null && !proposal.ok ? this.adjust.way() : null;
  });

  /** The line shown when there is nothing to preview yet. */
  protected readonly hint = computed(() =>
    this.adjust.amountText().trim() !== '' && this.adjust.mode() === null
      ? 'Choose + or −.'
      : 'Enter an amount or a new total.',
  );

  constructor() {
    // The store clears a box (the other way typed, a save, another product): the box follows.
    effect(() => {
      const text = this.adjust.amountText();
      if (text !== this.amountControl.value) {
        this.amountControl.setValue(text, { emitEvent: false });
      }
    });
    effect(() => {
      const text = this.adjust.totalText();
      if (text !== this.totalControl.value) {
        this.totalControl.setValue(text, { emitEvent: false });
      }
    });
    // Off while saving or half saved (US-64).
    effect(() => {
      const options = { emitEvent: false };
      if (this.review.locked()) {
        this.amountControl.disable(options);
        this.totalControl.disable(options);
      } else {
        this.amountControl.enable(options);
        this.totalControl.enable(options);
      }
    });
  }

  protected textOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
