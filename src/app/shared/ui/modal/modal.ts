import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { DialogModule } from 'primeng/dialog';

/**
 * Themed modal — wraps PrimeNG `p-dialog` (copied from V1). Provides focus-trap,
 * backdrop, and body scroll-lock/restore out of the box. Content is projected,
 * so any feature supplies its own body and buttons. `dismissable` (default
 * true, as in V1) allows the close button, Escape and a backdrop click; set it
 * to false for a dialog that must be answered with its own buttons (US-06).
 */
@Component({
  selector: 'stoqr-modal',
  imports: [DialogModule],
  templateUrl: './modal.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Modal {
  /** Two-way open state: `[(open)]`. */
  readonly open = model<boolean>(false);
  readonly header = input<string>('');
  readonly dismissable = input(true);
  readonly close = output<void>();

  protected onVisibleChange(visible: boolean): void {
    this.open.set(visible);
    if (!visible) {
      this.close.emit();
    }
  }
}
