import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';

import { DetailsReviewStore } from '@core/details/details-review-store';
import { DetailsStore } from '@core/details/details-store';
import { ProductSearchStore } from '@core/search/product-search-store';
import { DataHealthStore } from '@core/sheets/data-health-store';
import { RowRef } from '@core/sheets/row-ref';
import { StockReviewStore } from '@core/stock-adjust/stock-review-store';
import { displayValue } from '@shared/util/display-value';

/**
 * Where the two sheets disagree (US-31): repeated SKUs, unmatched Dr Trust
 * rows, Dr Trust products missing from the Dr Trust sheet, and quantity
 * differences. Informational only. A Master row can be picked to open it in
 * the editor (asking first if a details edit is unsaved). The lists come from
 * `DataHealthStore`; this component renders and forwards clicks.
 */
@Component({
  selector: 'app-data-health',
  imports: [NgTemplateOutlet],
  templateUrl: './data-health.html',
  styleUrl: './data-health.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataHealth {
  protected readonly store = inject(DataHealthStore);
  private readonly search = inject(ProductSearchStore);
  private readonly details = inject(DetailsStore);
  private readonly stockReview = inject(StockReviewStore);
  private readonly detailsReview = inject(DetailsReviewStore);
  protected readonly display = displayValue;

  /** A product was picked (or the panel closed): the page hides the panel. */
  readonly closed = output<void>();

  /** No picking while a save runs: its result must not be lost. */
  protected readonly saving = computed(
    () => this.stockReview.step() === 'saving' || this.detailsReview.step() === 'saving',
  );

  protected pick(ref: RowRef): void {
    this.details.confirmLeave(() => {
      this.search.select(ref);
      this.closed.emit();
    });
  }
}
