import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { Auth } from '@core/auth/auth';
import { DetailsReviewStore } from '@core/details/details-review-store';
import { ProductSearchStore } from '@core/search/product-search-store';
import { SheetsStore } from '@core/sheets/sheets-store';
import { StockReviewStore } from '@core/stock-adjust/stock-review-store';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { LoadingOverlay } from '@shared/ui/loading-overlay/loading-overlay';
import { Toast } from '@shared/ui/toast/toast';
import { ProductPicker } from './product-picker/product-picker';
import { ProductSummary } from './product-summary/product-summary';

/**
 * The editor page (US-12–14): loading and error states for both sheets, then
 * the product picker and, once a product is chosen, its summary with the
 * quantity adjuster or details form. A saved change is confirmed in a toast
 * (stock US-20, details US-24).
 */
@Component({
  selector: 'app-stock-editor',
  imports: [EmptyState, LoadingOverlay, ProductPicker, ProductSummary, Toast],
  templateUrl: './stock-editor.html',
  styleUrl: './stock-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockEditor {
  protected readonly sheets = inject(SheetsStore);
  protected readonly search = inject(ProductSearchStore);
  protected readonly auth = inject(Auth);
  protected readonly review = inject(StockReviewStore);
  protected readonly detailsReview = inject(DetailsReviewStore);

  constructor() {
    void this.sheets.ensureLoaded();
  }
}
