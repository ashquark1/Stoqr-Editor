import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ReviewStep } from '@core/sheets/review-flow';

/**
 * The buttons under the details review (US-79, US-80): Save changes / Back
 * while reviewing; a busy "Saving…" and a disabled Back while saving. Outcomes
 * are strips with their own buttons (US-80). The store decides what the clicks
 * do. (Stock has no review since CR-04; its results are strips, US-76.)
 */
@Component({
  selector: 'app-review-actions',
  templateUrl: './review-actions.html',
  styleUrl: './review-actions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewActions {
  readonly step = input.required<ReviewStep>();
  readonly approve = output<void>();
  readonly back = output<void>();
}
