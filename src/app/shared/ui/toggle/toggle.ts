import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Reusable on/off switch, copied from V1 (US-70 filter toggles). A native checkbox provides the
 * semantics and keyboard/focus behaviour; the track/thumb are decorative. Styling
 * is token-based (`.stoqr-toggle*`), mobile-first. Vendor-free native primitive,
 * consistent with `<stoqr-badge>` / `<stoqr-logo>`.
 */
@Component({
  selector: 'stoqr-toggle',
  template: `
    <label class="stoqr-toggle">
      <input
        type="checkbox"
        class="stoqr-toggle__input"
        role="switch"
        [checked]="checked()"
        (change)="onToggle($event)"
      />
      <span class="stoqr-toggle__track" aria-hidden="true">
        <span class="stoqr-toggle__thumb"></span>
      </span>
      <span class="stoqr-toggle__label">{{ label() }}</span>
    </label>
  `,
  styleUrl: './toggle.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Toggle {
  readonly label = input.required<string>();
  readonly checked = input(false);

  readonly checkedChange = output<boolean>();

  protected onToggle(event: Event): void {
    this.checkedChange.emit((event.target as HTMLInputElement).checked);
  }
}
