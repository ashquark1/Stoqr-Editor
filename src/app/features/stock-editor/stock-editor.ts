import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { Auth } from '@core/auth/auth';
import { PanelStore } from '@core/layout/panel-store';
import { ProductNavigation } from '@core/navigation/product-navigation';
import { ProductSearchStore } from '@core/search/product-search-store';
import { SheetsStore } from '@core/sheets/sheets-store';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { Modal } from '@shared/ui/modal/modal';
import { Toast } from '@shared/ui/toast/toast';
import { DataHealth } from './data-health/data-health';
import { FilterPanel } from './filter-panel/filter-panel';
import { ProductPicker } from './product-picker/product-picker';
import { ProductSummary } from './product-summary/product-summary';
import { ResultsToolbar } from './results-toolbar/results-toolbar';
import { SearchRow } from './search-row/search-row';

/**
 * The editor page (US-12–14): loading and error states for both sheets, then
 * the product picker and, once a product is chosen, its summary with the
 * quantity adjuster or details form. A saved change is confirmed in a toast
 * (stock US-20, details US-24). Data health (US-31) opens above them, from
 * the bottom bar's button (US-51; its open state is in `PanelStore`).
 */
@Component({
  selector: 'app-stock-editor',
  imports: [DataHealth, EmptyState, FilterPanel, Modal, ProductPicker, ProductSummary, ResultsToolbar, SearchRow, Toast],
  templateUrl: './stock-editor.html',
  styleUrl: './stock-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockEditor {
  protected readonly sheets = inject(SheetsStore);
  protected readonly search = inject(ProductSearchStore);
  protected readonly auth = inject(Auth);
  protected readonly panels = inject(PanelStore);
  protected readonly navigation = inject(ProductNavigation);

  constructor() {
    void this.sheets.ensureLoaded();
  }
}
