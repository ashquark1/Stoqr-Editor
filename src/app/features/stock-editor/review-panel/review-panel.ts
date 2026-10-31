import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { AppConfig } from '@core/config/app-config';
import { StockReviewStore } from '@core/stock-adjust/stock-review-store';

/**
 * The result of a stock Apply (US-64) or Undo (US-65), shown under the
 * adjuster: saving / undoing, saved (with Undo), restored, conflict / refused,
 * failed (Try again) or half saved (Retry / Close). Interim
 * until US-76 replaces it with the shared strips. All state and the write
 * live in `StockReviewStore`; this component renders and forwards clicks.
 */
@Component({
  selector: 'app-review-panel',
  templateUrl: './review-panel.html',
  styleUrl: './review-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewPanel {
  protected readonly review = inject(StockReviewStore);
  protected readonly drTrustLabel = inject(AppConfig).sheet('dr-trust').label;
}
