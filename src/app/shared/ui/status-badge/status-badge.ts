import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { resolveProductStatus, statusLabel } from '@core/models/product-status';

/**
 * Product lifecycle-status indicator (US-13). Renders a distinct pill for
 * Inactive (grey) and Discontinued (muted red) rows; Active (and any other
 * status) renders as plain text so the default Active-only view is unchanged.
 *
 * Distinct from `<stoqr-badge>` (stock status): this is the `.stoqr-status-badge`
 * outlined family, no status dot. Pure presentation of the verbatim sheet status.
 */
@Component({
  selector: 'stoqr-status-badge',
  template: `
    @if (variant() === 'inactive' || variant() === 'discontinued') {
      <span [class]="'stoqr-status-badge stoqr-status-badge--' + variant()">
        {{ label() }}
      </span>
    } @else {
      {{ label() }}
    }
  `,
  styleUrl: './status-badge.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadge {
  readonly status = input.required<string>();

  protected readonly variant = computed(() => resolveProductStatus(this.status()));
  protected readonly label = computed(() => statusLabel(this.status()));
}
