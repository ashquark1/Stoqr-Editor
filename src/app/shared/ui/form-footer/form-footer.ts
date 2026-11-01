import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Footer bar for a form or its review (US-92): a status line on the left,
 * then a secondary and a primary button on the right (44px). Under 768px it
 * stacks: status, primary full width, secondary full width. Spans the card
 * width when the card sets `--form-footer-bleed` to its padding. Generic: it
 * knows nothing about details or products; the feature decides the texts and
 * what the clicks do. Reused by the New product form and review (US-99/100).
 */
@Component({
  selector: 'stoqr-form-footer',
  templateUrl: './form-footer.html',
  styleUrl: './form-footer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormFooter {
  /** The status line (e.g. "2 fields changed"); announced politely when it changes. */
  readonly status = input('');
  /** Primary button label; empty hides it. */
  readonly primaryLabel = input('');
  /** Secondary button label; empty hides it. */
  readonly secondaryLabel = input('');
  readonly primaryDisabled = input(false);
  readonly secondaryDisabled = input(false);
  /** The primary action is running: spinner, aria-busy, disabled. */
  readonly busy = input(false);

  readonly primary = output<void>();
  readonly secondary = output<void>();
}
