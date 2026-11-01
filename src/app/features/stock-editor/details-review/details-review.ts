import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, viewChild } from '@angular/core';

import { DetailsReviewStore } from '@core/details/details-review-store';
import { DetailsStore } from '@core/details/details-store';
import { NewProductReviewStore } from '@core/details/new-product-review-store';
import { ProductNavigation } from '@core/navigation/product-navigation';
import { Badge } from '@shared/ui/badge/badge';
import { FormFooter } from '@shared/ui/form-footer/form-footer';
import { Strip } from '@shared/ui/strip/strip';
import { displayValue } from '@shared/util/display-value';

/**
 * In the New product form (`DetailsStore.isNew()`, US-100) it reviews the new
 * product instead: every filled value, the sheets, the derived Stock Status,
 * Save product / Back and the result strips, from `NewProductReviewStore`.
 *
 * Review & approve a details edit (US-23): only the changed fields, old → new,
 * the sheets it saves to, Dr Trust's old value where it differs, and the Stock
 * Status changes the save brings; then the outcome. Replaces the form (US-79);
 * focus lands on its heading when it opens. All state and the write live in
 * `DetailsReviewStore`; this component renders and forwards clicks.
 */
@Component({
  selector: 'app-details-review',
  imports: [Badge, FormFooter, Strip],
  templateUrl: './details-review.html',
  styleUrl: './details-review.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsReview {
  protected readonly review = inject(DetailsReviewStore);
  protected readonly details = inject(DetailsStore);
  /** The New product review (US-100): this component's `new` mode, the same layout. */
  protected readonly newReview = inject(NewProductReviewStore);
  protected readonly navigation = inject(ProductNavigation);
  protected readonly display = displayValue;

  private readonly heading = viewChild<ElementRef<HTMLElement>>('reviewTitle');

  constructor() {
    afterNextRender(() => this.heading()?.nativeElement.focus());
  }
}
