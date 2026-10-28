import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { MAX_SHOWN, ProductSearchStore } from '@core/search/product-search-store';
import { Badge } from '@shared/ui/badge/badge';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { StatusBadge } from '@shared/ui/status-badge/status-badge';
import { displayValue } from '@shared/util/display-value';

/**
 * Search-as-you-type over master products (US-12, US-14). The query lives in
 * `ProductSearchStore`; this component forwards what is typed and renders the
 * store's results. The result list hides once a product is selected.
 */
@Component({
  selector: 'app-product-picker',
  imports: [Badge, EmptyState, ReactiveFormsModule, StatusBadge],
  templateUrl: './product-picker.html',
  styleUrl: './product-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductPicker {
  protected readonly search = inject(ProductSearchStore);
  protected readonly display = displayValue;
  protected readonly maxShown = MAX_SHOWN;

  /** Starts from the store's query, so returning to the page keeps it. */
  protected readonly queryControl = new FormControl(this.search.query(), { nonNullable: true });
  private readonly typed = toSignal(this.queryControl.valueChanges, {
    initialValue: this.queryControl.value,
  });

  constructor() {
    effect(() => this.search.setQuery(this.typed()));
  }
}
