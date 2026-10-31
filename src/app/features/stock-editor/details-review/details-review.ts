import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, viewChild } from '@angular/core';

import { DetailsReviewStore } from '@core/details/details-review-store';
import { Badge } from '@shared/ui/badge/badge';
import { Strip } from '@shared/ui/strip/strip';
import { displayValue } from '@shared/util/display-value';
import { ReviewActions } from '../review-actions/review-actions';

/**
 * Review & approve a details edit (US-23): only the changed fields, old → new,
 * the sheets it saves to, Dr Trust's old value where it differs, and the Stock
 * Status changes the save brings; then the outcome. Replaces the form (US-79);
 * focus lands on its heading when it opens. All state and the write live in
 * `DetailsReviewStore`; this component renders and forwards clicks.
 */
@Component({
  selector: 'app-details-review',
  imports: [Badge, ReviewActions, Strip],
  templateUrl: './details-review.html',
  styleUrl: './details-review.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsReview {
  protected readonly review = inject(DetailsReviewStore);
  protected readonly display = displayValue;

  private readonly heading = viewChild<ElementRef<HTMLElement>>('reviewTitle');

  constructor() {
    afterNextRender(() => this.heading()?.nativeElement.focus());
  }
}
