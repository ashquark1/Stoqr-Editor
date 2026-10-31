import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ProductNavigation } from '@core/navigation/product-navigation';
import { ProductSearchStore } from '@core/search/product-search-store';
import { Badge } from '@shared/ui/badge/badge';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { StatusBadge } from '@shared/ui/status-badge/status-badge';
import { SyncBadge } from '@shared/ui/sync-badge/sync-badge';
import { displayValue } from '@shared/util/display-value';

/**
 * Search results over master products (US-12, US-14). The query is typed in
 * the search row (`app-search-row`, US-50) and lives in `ProductSearchStore`;
 * this component renders every match (no cap, US-55): on the home screen, or
 * over an open product when a new search runs (US-59). Choosing one goes
 * through `ProductNavigation` (asks first when work would be lost).
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
  protected readonly navigation = inject(ProductNavigation);
  protected readonly display = displayValue;
}
