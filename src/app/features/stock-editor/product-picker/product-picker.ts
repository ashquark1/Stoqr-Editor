import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { MAX_SHOWN, ProductSearchStore } from '@core/search/product-search-store';
import { Badge } from '@shared/ui/badge/badge';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { StatusBadge } from '@shared/ui/status-badge/status-badge';
import { SyncBadge } from '@shared/ui/sync-badge/sync-badge';
import { displayValue } from '@shared/util/display-value';

/**
 * Search results over master products (US-12, US-14). The query is typed in
 * the search row (`app-search-row`, US-50) and lives in `ProductSearchStore`;
 * this component renders the store's results. The list hides once a product is
 * selected.
 */
@Component({
  selector: 'app-product-picker',
  imports: [Badge, EmptyState, StatusBadge, SyncBadge],
  templateUrl: './product-picker.html',
  styleUrl: './product-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductPicker {
  protected readonly search = inject(ProductSearchStore);
  protected readonly display = displayValue;
  protected readonly maxShown = MAX_SHOWN;
}
