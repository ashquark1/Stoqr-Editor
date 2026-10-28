import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  input,
  output,
} from '@angular/core';

/**
 * Reusable error toast — fixed top-center, branded (`.stoqr-toast`), with a
 * Retry action and a close button. Announces itself to screen readers
 * (`role="alert"` + `aria-live="assertive"`) and auto-dismisses after a timeout
 * (cleared on manual dismiss/retry/destroy). Generic: any feature can show one.
 */
@Component({
  selector: 'stoqr-toast',
  templateUrl: './toast.html',
  styleUrl: './toast.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Toast implements OnInit, OnDestroy {
  readonly message = input.required<string>();
  readonly title = input("Couldn't load products");
  readonly autoDismissMs = input(5000);

  readonly retry = output<void>();
  readonly dismiss = output<void>();

  private timer: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    this.timer = setTimeout(() => this.dismiss.emit(), this.autoDismissMs());
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  protected onRetry(): void {
    this.clearTimer();
    this.retry.emit();
  }

  protected onClose(): void {
    this.clearTimer();
    this.dismiss.emit();
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
