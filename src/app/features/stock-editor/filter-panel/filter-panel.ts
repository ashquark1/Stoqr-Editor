import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';

import { FilterStore } from '@core/search/filter-store';
import { FacetKey } from '@core/search/product-filter';
import { FilterSelect } from '@shared/ui/filter-select/filter-select';
import { FloatingPanel } from '@shared/ui/floating-panel/floating-panel';
import { Toggle } from '@shared/ui/toggle/toggle';

/** The dropdowns in V1's order; Brand gets a search box. */
const FACETS: readonly { key: FacetKey; label: string; search: boolean }[] = [
  { key: 'status', label: 'Stock Status', search: false },
  { key: 'category', label: 'Category', search: false },
  { key: 'subCategory', label: 'Sub-category', search: false },
  { key: 'brand', label: 'Brand', search: true },
];

/**
 * The filter panel (US-70): V1's dropdowns and toggles in the shared floating
 * panel, under the results toolbar and over the results, which update as the
 * filters change. Filter state is `FilterStore`; open state is `PanelStore`.
 * Closes with ✕, Escape, the Filters button, or opening a product.
 */
@Component({
  selector: 'app-filter-panel',
  imports: [FilterSelect, FloatingPanel, Toggle],
  templateUrl: './filter-panel.html',
  styleUrl: './filter-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterPanel {
  protected readonly filters = inject(FilterStore);
  protected readonly facets = FACETS;
  readonly closed = output<void>();
}
