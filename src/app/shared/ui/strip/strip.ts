import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  input,
  output,
} from '@angular/core';

/**
 * Message strip (US-54): the one inline result message used inside cards
 * (stock strips US-76, details strips US-80). Three looks — success (green),
 * problem (red), warning (amber) — each with an icon so colour is never the
 * only signal. Success is announced politely (`role="status"`), problem and
 * warning at once (`role="alert"`). Up to two buttons (empty label hides one).
 * `autoDismissMs` > 0 emits `dismissed` after that time; the feature removes
 * the strip. Generic: it knows nothing about stock or details.
 */
@Component({
  selector: 'stoqr-strip',
  templateUrl: './strip.html',
  styleUrl: './strip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Strip implements OnInit, OnDestroy {
  readonly variant = input<'success' | 'problem' | 'warning'>('success');
  /** Optional bold opening, e.g. "Stock saved." */
  readonly lead = input('');
  readonly message = input.required<string>();
  /** Primary button label; empty hides it. */
  readonly primaryLabel = input('');
  /** Secondary button label; empty hides it. */
  readonly secondaryLabel = input('');
  /** Milliseconds before `dismissed`; 0 keeps the strip until the feature removes it. */
  readonly autoDismissMs = input(0);

  readonly primary = output<void>();
  readonly secondary = output<void>();
  readonly dismissed = output<void>();

  private timer: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    if (this.autoDismissMs() > 0) {
      this.timer = setTimeout(() => this.dismissed.emit(), this.autoDismissMs());
    }
  }

  ngOnDestroy(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
  }
}
