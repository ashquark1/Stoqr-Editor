import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { DetailsReviewStore } from '@core/details/details-review-store';
import { Badge } from '@shared/ui/badge/badge';
import { displayValue } from '@shared/util/display-value';
import { ReviewActions } from '../review-actions/review-actions';

/**
 * Review & approve a details edit (US-23): only the changed fields, old → new,
 * the sheets it saves to, Dr Trust's old value where it differs, and the Stock
 * Status changes the save brings; then the outcome. All state and the write
 * live in `DetailsReviewStore`; this component renders and forwards clicks.
 */
@Component({
  selector: 'app-details-review',
  imports: [Badge, ReviewActions],
  templateUrl: './details-review.html',
  styleUrl: './details-review.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsReview {
  protected readonly review = inject(DetailsReviewStore);
  protected readonly display = displayValue;
}
