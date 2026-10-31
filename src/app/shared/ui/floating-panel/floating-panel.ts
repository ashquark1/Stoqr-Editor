import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  input,
  output,
  signal,
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
 * Shared by Data health and the filter panel. Not modal.
 *
 * `placement="below"` (US-70): instead, it floats under whatever comes before
 * it inside a `position: relative` parent (the results toolbar), as wide as
 * that parent, over the content below; it is measured on open and on resize so
 * it never reaches under the bottom bar.
 */
@Component({
  selector: 'stoqr-floating-panel',
  templateUrl: './floating-panel.html',
  styleUrl: './floating-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'closed.emit()',
    '(window:resize)': 'measure()',
  },
})
export class FloatingPanel implements OnDestroy {
  readonly heading = input.required<string>();
  /** Accessible name of the ✕, e.g. "Close data health". */
  readonly closeLabel = input.required<string>();
  /** `bottom`: above the bottom bar (default). `below`: under the element before it. */
  readonly placement = input<'bottom' | 'below'>('bottom');
  readonly closed = output<void>();

  /** For `below`: the panel's top edge in the viewport, so its height can stop at the bottom bar. */
  protected readonly topPx = signal(0);
  private readonly layerEl = viewChild.required<ElementRef<HTMLElement>>('layerEl');

  protected readonly headingId = `stoqr-floating-panel-${nextId++}`;
  private readonly headingEl = viewChild.required<ElementRef<HTMLElement>>('headingEl');
  private readonly opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  constructor() {
    afterNextRender(() => {
      this.measure();
      this.headingEl().nativeElement.focus();
    });
  }

  protected measure(): void {
    if (this.placement() === 'below') {
      this.topPx.set(Math.max(0, this.layerEl().nativeElement.getBoundingClientRect().top));
    }
  }

  ngOnDestroy(): void {
    // Back to the button that opened it, if it is still on the page — but only
    // when focus is in this panel (or lost). When another panel's button closed
    // it, focus stays on that button, so the new panel returns there (US-71).
    const active = document.activeElement;
    const focusHere = active === null || active === document.body || this.layerEl().nativeElement.contains(active);
    if (focusHere && this.opener?.isConnected) {
      this.opener.focus();
    }
  }
}
