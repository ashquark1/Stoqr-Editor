import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  input,
  output,
  viewChild,
} from '@angular/core';

let nextId = 0;

/**
 * Floating panel (US-52): opens upward from the bottom bar, as wide as the
 * content column, below both bars (never covers them); the body scrolls when
 * it is taller than the space between the bars while the header stays put.
 * Close: the ✕, Escape, or the feature removing it (e.g. its bottom-bar
 * button). A click outside does not close it. Focus moves to the heading on
 * open and back to whatever had it (the opening button) when it goes.
 * Shared by Data health and, later, the filter panel (US-70). Not modal.
 */
@Component({
  selector: 'stoqr-floating-panel',
  templateUrl: './floating-panel.html',
  styleUrl: './floating-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class FloatingPanel implements OnDestroy {
  readonly heading = input.required<string>();
  /** Accessible name of the ✕, e.g. "Close data health". */
  readonly closeLabel = input.required<string>();
  readonly closed = output<void>();

  protected readonly headingId = `stoqr-floating-panel-${nextId++}`;
  private readonly headingEl = viewChild.required<ElementRef<HTMLElement>>('headingEl');
  private readonly opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  constructor() {
    afterNextRender(() => this.headingEl().nativeElement.focus());
  }

  ngOnDestroy(): void {
    // Back to the button that opened it, if it is still on the page.
    if (this.opener?.isConnected) {
      this.opener.focus();
    }
  }
}
