import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Full-screen themed loading overlay (uses the design-system spinner). */
@Component({
  selector: 'stoqr-loading-overlay',
  template: `
    <div class="stoqr-spinner-overlay" role="status" aria-live="polite">
      <div class="stoqr-spinner stoqr-spinner--lg"></div>
      <span class="stoqr-spinner-overlay__label">{{ label() }}</span>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingOverlay {
  readonly label = input('Loading…');
}
