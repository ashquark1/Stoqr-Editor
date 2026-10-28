import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  input,
  output,
} from '@angular/core';

/**
 * Reusable toast — fixed top-center, branded (`.stoqr-toast`), with one action
 * button and a close button. `error` (default) announces itself assertively;
 * `warning` politely. Auto-dismisses after `autoDismissMs` (0 = never), cleared
 * on manual dismiss/action/destroy. Generic: any feature can show one.
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
  /** `error` (default) or `warning`; maps to the theme's `.stoqr-toast--*` variants. */
  readonly variant = input<'error' | 'warning'>('error');
  /** Label of the action button; emits `retry` when clicked. */
  readonly actionLabel = input('Retry');
  /** Milliseconds before dismissing itself; 0 keeps it until the user acts. */
  readonly autoDismissMs = input(5000);

  readonly retry = output<void>();
  readonly dismiss = output<void>();

  private timer: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    if (this.autoDismissMs() > 0) {
      this.timer = setTimeout(() => this.dismiss.emit(), this.autoDismissMs());
    }
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
