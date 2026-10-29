import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { StockAdjustStore } from '@core/stock-adjust/stock-adjust-store';
import { StockReviewStore } from '@core/stock-adjust/stock-review-store';
import { Badge } from '@shared/ui/badge/badge';

/**
 * Add/subtract a whole amount with a live preview (US-15–17). The mode, the
 * amount and every result live in `StockAdjustStore`; this component forwards
 * input and renders. Nothing is saved here (review/approve is story B).
 */
@Component({
  selector: 'app-quantity-adjuster',
  imports: [Badge, ReactiveFormsModule],
  templateUrl: './quantity-adjuster.html',
  styleUrl: './quantity-adjuster.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuantityAdjuster {
  protected readonly adjust = inject(StockAdjustStore);
  protected readonly review = inject(StockReviewStore);

  protected readonly amountControl = new FormControl(this.adjust.amountText(), { nonNullable: true });
  private readonly typed = toSignal(this.amountControl.valueChanges, {
    initialValue: this.amountControl.value,
  });

  constructor() {
    effect(() => this.adjust.setAmount(this.typed()));
    // When the store resets (another product), clear the box too.
    effect(() => {
      const text = this.adjust.amountText();
      if (text !== this.amountControl.value) {
        this.amountControl.setValue(text, { emitEvent: false });
      }
    });
  }
}
