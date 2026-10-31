import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { DetailsReviewStore } from '@core/details/details-review-store';
import { DetailsStore } from '@core/details/details-store';
import { ProductNavigation } from '@core/navigation/product-navigation';
import { ProductSearchStore } from '@core/search/product-search-store';
import { StockReviewStore } from '@core/stock-adjust/stock-review-store';
import { Badge } from '@shared/ui/badge/badge';
import { StatusBadge } from '@shared/ui/status-badge/status-badge';
import { SyncBadge } from '@shared/ui/sync-badge/sync-badge';
import { displayValue } from '@shared/util/display-value';
import { DetailsForm } from '../details-form/details-form';
import { QuantityAdjuster } from '../quantity-adjuster/quantity-adjuster';
import { ReviewPanel } from '../review-panel/review-panel';

export type SummaryMode = 'adjust' | 'details';

/**
 * The selected product, so staff can confirm it is the right one (US-13),
 * with ONE editor at a time: the stock adjuster or the details form (US-21).
 * Whether the form is open is `DetailsStore.formOpen` (US-66); leaving it with
 * unsaved edits asks first (`ProductNavigation`).
 * The details form is loaded only when opened (`@defer`), keeping it out of
 * the first download.
 */
@Component({
  selector: 'app-product-summary',
  imports: [Badge, DetailsForm, QuantityAdjuster, ReviewPanel, StatusBadge, SyncBadge],
  templateUrl: './product-summary.html',
  styleUrl: './product-summary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductSummary {
  protected readonly search = inject(ProductSearchStore);
  protected readonly review = inject(StockReviewStore);
  private readonly details = inject(DetailsStore);
  private readonly detailsReview = inject(DetailsReviewStore);
  private readonly navigation = inject(ProductNavigation);
  protected readonly display = displayValue;

  /** Which editor is open; another product starts on Adjust stock. */
  protected readonly mode = computed<SummaryMode>(() => (this.details.formOpen() ? 'details' : 'adjust'));

  /** A stock or details save is running: its result must not be lost. */
  protected readonly saving = this.navigation.saving;
  /** A stock or details review is open (including its outcome): the editor switch is locked. */
  protected readonly reviewOpen = computed(
    () => this.review.step() !== 'editing' || this.detailsReview.step() !== 'editing',
  );

  protected show(mode: SummaryMode): void {
    if (mode === 'details') {
      this.navigation.openDetails();
    } else {
      this.navigation.closeDetails();
    }
  }

  protected changeProduct(): void {
    this.navigation.closeProduct();
  }
}
