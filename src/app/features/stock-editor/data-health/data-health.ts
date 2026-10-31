import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';

import { ProductNavigation } from '@core/navigation/product-navigation';
import { DataHealthStore } from '@core/sheets/data-health-store';
import { RowRef } from '@core/sheets/row-ref';
import { FloatingPanel } from '@shared/ui/floating-panel/floating-panel';
import { displayValue } from '@shared/util/display-value';

/**
 * Where the two sheets disagree (US-31): repeated SKUs, unmatched Dr Trust
 * rows, Dr Trust products missing from the Dr Trust sheet, and quantity
 * differences. Informational only. A Master row can be picked to open it in
 * the editor like a search for its SKU (US-61, `ProductNavigation`: filters
 * reset, asks first when work would be lost). The lists come from
 * `DataHealthStore`; this component renders and forwards clicks.
 */
@Component({
  selector: 'app-data-health',
  imports: [FloatingPanel, NgTemplateOutlet],
  templateUrl: './data-health.html',
  styleUrl: './data-health.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataHealth {
  protected readonly store = inject(DataHealthStore);
  private readonly navigation = inject(ProductNavigation);
  protected readonly display = displayValue;

  /** The panel's ✕ or Escape: the page hides the panel (a pick closes it in `ProductNavigation`). */
  readonly closed = output<void>();

  /** No picking while a save runs: its result must not be lost. */
  protected readonly saving = this.navigation.saving;

  protected pick(ref: RowRef): void {
    this.navigation.pickFromHealth(ref);
  }
}
