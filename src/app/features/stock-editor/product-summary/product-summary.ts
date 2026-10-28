import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ProductSearchStore } from '@core/search/product-search-store';
import { Badge } from '@shared/ui/badge/badge';
import { StatusBadge } from '@shared/ui/status-badge/status-badge';
import { SyncBadge } from '@shared/ui/sync-badge/sync-badge';
import { displayValue } from '@shared/util/display-value';
import { QuantityAdjuster } from '../quantity-adjuster/quantity-adjuster';

/** The selected product, so staff can confirm it is the right one (US-13). */
@Component({
  selector: 'app-product-summary',
  imports: [Badge, QuantityAdjuster, StatusBadge, SyncBadge],
  templateUrl: './product-summary.html',
  styleUrl: './product-summary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductSummary {
  protected readonly search = inject(ProductSearchStore);
  protected readonly display = displayValue;
}
