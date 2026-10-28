import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { resolveStockVariant, stockLabel } from '@core/stock-adjust/stock-status-display';

/**
 * Reusable stock-status badge. Takes the verbatim sheet `stockStatus` string and
 * resolves the correct pill variant internally (no recomputation of stock — pure
 * presentation). Styling reuses the theme's `.stoqr-badge` classes (which are
 * token-based and WCAG-AA per the brand spec).
 */
@Component({
  selector: 'stoqr-badge',
  template: `
    <span [class]="'stoqr-badge stoqr-badge--' + variant()">
      <span class="stoqr-badge__dot"></span>{{ label() }}
    </span>
  `,
  styleUrl: './badge.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Badge {
  readonly status = input.required<string>();

  protected readonly variant = computed(() => resolveStockVariant(this.status()));
  protected readonly label = computed(() => stockLabel(this.status()));
}
