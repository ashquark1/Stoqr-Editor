import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ReviewStep } from '@core/sheets/review-flow';

/**
 * The buttons under every review (stock and details): Approve / Back while
 * reviewing, a disabled "Saving…", then the outcome's own buttons (Review
 * again, Try again, Retry <sheet> / Close). Shared so both reviews behave the
 * same; the store behind each review decides what the clicks do.
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
