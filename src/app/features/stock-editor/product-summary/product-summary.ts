import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  untracked,
  viewChild,
} from '@angular/core';

import { DetailsStore } from '@core/details/details-store';
import { ProductNavigation } from '@core/navigation/product-navigation';
import { ProductSearchStore } from '@core/search/product-search-store';
import { StockReviewStore } from '@core/stock-adjust/stock-review-store';
import { Badge } from '@shared/ui/badge/badge';
import { StatusBadge } from '@shared/ui/status-badge/status-badge';
import { SyncBadge } from '@shared/ui/sync-badge/sync-badge';
import { StoqrTooltip } from '@shared/ui/tooltip/tooltip';
import { displayValue } from '@shared/util/display-value';
import { DetailsForm } from '../details-form/details-form';
import { QuantityAdjuster } from '../quantity-adjuster/quantity-adjuster';
import { ReviewPanel } from '../review-panel/review-panel';

/**
 * The open product as a card under the toolbar (US-72): brand and name, five
 * tiles (SKU, Stock qty, Stock status, Status, Sync; US-74), then the stock
 * adjuster for an editable product or the reasons it is blocked. The pencil
 * (editable) or eye (read-only) opens the details form, which replaces the
 * body while the header stays; its open state is `DetailsStore.formOpen`
 * (US-66) and every step goes through `ProductNavigation`. The form is loaded
 * only when opened (`@defer`).
 */
@Component({
  selector: 'app-product-summary',
  imports: [Badge, DetailsForm, QuantityAdjuster, ReviewPanel, StatusBadge, StoqrTooltip, SyncBadge],
  templateUrl: './product-summary.html',
  styleUrl: './product-summary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductSummary {
  protected readonly search = inject(ProductSearchStore);
  protected readonly review = inject(StockReviewStore);
  protected readonly details = inject(DetailsStore);
  protected readonly navigation = inject(ProductNavigation);
  protected readonly display = displayValue;

  /** The pencil / eye is off while a save runs or a half-done stock save waits for Retry or Close (US-64). */
  protected readonly iconLocked = computed(() => this.navigation.saving() || this.review.step() === 'partial');
  /** A stock result to show under the adjuster (interim until the strips of US-76). */
  protected readonly stockOutcome = computed(() => this.review.step() !== 'editing' || this.review.saved() !== null);

  private readonly title = viewChild<ElementRef<HTMLElement>>('titleEl');
  private readonly injector = inject(Injector);

  constructor() {
    // Focus moves to the card heading when a product opens (US-72); a refresh keeps the key.
    effect(() => {
      this.search.selectionKey();
      untracked(() =>
        afterNextRender(() => this.title()?.nativeElement.focus({ preventScroll: true }), {
          injector: this.injector,
        }),
      );
    });
  }
}
