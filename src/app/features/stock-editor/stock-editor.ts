import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { Auth } from '@core/auth/auth';
import { ProductSearchStore } from '@core/search/product-search-store';
import { SheetsStore } from '@core/sheets/sheets-store';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { LoadingOverlay } from '@shared/ui/loading-overlay/loading-overlay';
import { ProductPicker } from './product-picker/product-picker';
import { ProductSummary } from './product-summary/product-summary';

/**
 * The editor page (US-12–14): loading and error states for both sheets, then
 * the product picker and, once a product is chosen, its summary. Later stories
 * add the quantity adjuster and details form here.
 */
@Component({
  selector: 'app-stock-editor',
  imports: [EmptyState, LoadingOverlay, ProductPicker, ProductSummary],
  templateUrl: './stock-editor.html',
  styleUrl: './stock-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockEditor {
  protected readonly sheets = inject(SheetsStore);
  protected readonly search = inject(ProductSearchStore);
  protected readonly auth = inject(Auth);

  constructor() {
    void this.sheets.ensureLoaded();
  }
}
