import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { PanelStore } from '@core/layout/panel-store';
import { ProductSearchStore } from '@core/search/product-search-store';
import { SheetsStore } from '@core/sheets/sheets-store';
import { StoqrTooltip } from '@shared/ui/tooltip/tooltip';
import { RelativeTimePipe, exactTime } from '@shared/util/relative-time';

/**
 * V1's results toolbar (US-69): Filters (n), the result count, "Last updated"
 * (relative, exact time in a tooltip) and Refresh. One line from 768px; a 2×2
 * grid on phones. Renders store state and forwards clicks only: the filter
 * panel's open state is in `PanelStore`, Refresh is `SheetsStore.refresh()`.
 */
@Component({
  selector: 'app-results-toolbar',
  imports: [RelativeTimePipe, StoqrTooltip],
  templateUrl: './results-toolbar.html',
  styleUrl: './results-toolbar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultsToolbar {
  protected readonly search = inject(ProductSearchStore);
  protected readonly sheets = inject(SheetsStore);
  protected readonly panels = inject(PanelStore);
  protected readonly exactTime = exactTime;
}
