import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ReviewStep } from '@core/sheets/review-flow';

/**
 * The buttons under the details review (US-79): Save changes / Back while
 * reviewing, a disabled "Saving…", then the outcome's own buttons (Review
 * again, Try again, Retry <sheet> / Close). The store decides what the clicks
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
  /** The sheet(s) Retry would finish; null hides Retry. */
  readonly retryLabel = input<string | null>(null);

  readonly approve = output<void>();
  readonly back = output<void>();
  readonly reviewAgain = output<void>();
  readonly retry = output<void>();
}
