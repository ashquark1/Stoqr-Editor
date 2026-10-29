import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { StockReviewStore } from '@core/stock-adjust/stock-review-store';
import { Badge } from '@shared/ui/badge/badge';

/**
 * Review & approve a quantity change (US-18, 35): shows exactly what will be
 * written and to which sheets, then the outcome. All state and the write
 * itself live in `StockReviewStore`; this component renders and forwards
 * clicks.
 */
@Component({
  selector: 'app-review-panel',
  imports: [Badge],
  templateUrl: './review-panel.html',
  styleUrl: './review-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewPanel {
  protected readonly review = inject(StockReviewStore);
}
