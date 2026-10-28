import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { SYNC_BADGE_LABELS, SyncBadgeKind } from '@core/sheets/sync-badge';

/**
 * How a master product relates to the Dr Trust sheet (US-37): Linked, Master
 * only, Out of sync or Blocked. Reuses the outlined `.stoqr-status-badge` pill
 * shape so it reads differently from the filled stock badge; the text label
 * carries the meaning, the colour only reinforces it. Renders nothing when the
 * kind is unknown.
 */
@Component({
  selector: 'stoqr-sync-badge',
  template: `
    @if (kind(); as k) {
      <span [class]="'stoqr-status-badge sync-badge sync-badge--' + k">{{ label() }}</span>
    }
  `,
  styleUrl: './sync-badge.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SyncBadge {
  readonly kind = input<SyncBadgeKind | undefined>(undefined);

  protected readonly label = computed(() => {
    const k = this.kind();
    return k === undefined ? '' : SYNC_BADGE_LABELS[k];
  });
}
