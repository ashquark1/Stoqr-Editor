import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CheckboxModule } from 'primeng/checkbox';

let nextId = 0;

/**
 * Themed checkbox (US-44) — wraps PrimeNG `p-checkbox` (binary) with a real
 * `<label for>`, so the words toggle it too. A form control:
 * `<stoqr-checkbox label="Remember me" [formControl]="ctrl" />`. The whole row
 * is a 44px tap target; colours come from the preset, focus ring from the theme.
 */
@Component({
  selector: 'stoqr-checkbox',
  imports: [FormsModule, CheckboxModule],
  template: `
    <label class="stoqr-checkbox" [for]="inputId">
      <p-checkbox
        [binary]="true"
        [inputId]="inputId"
        [ngModel]="checked()"
        [disabled]="disabled()"
        (ngModelChange)="toggle($event)"
        (onBlur)="onTouched()"
      />
      <span class="stoqr-checkbox__label">{{ label() }}</span>
    </label>
  `,
  styleUrl: './checkbox.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Checkbox), multi: true },
  ],
})
export class Checkbox implements ControlValueAccessor {
  readonly label = input.required<string>();

  protected readonly inputId = `stoqr-checkbox-${nextId++}`;
  protected readonly checked = signal(false);
  protected readonly disabled = signal(false);

  private onChange: (value: boolean) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  writeValue(value: boolean | null): void {
    this.checked.set(value === true);
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected toggle(value: boolean): void {
    this.checked.set(value);
    this.onChange(value);
  }
}
