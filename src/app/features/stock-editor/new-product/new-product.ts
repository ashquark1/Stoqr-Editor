import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, viewChild } from '@angular/core';

import { ProductNavigation } from '@core/navigation/product-navigation';
import { StoqrTooltip } from '@shared/ui/tooltip/tooltip';

/**
 * The New product shell (US-93): a card under the search row titled "New
 * product" with the close X (US-92's look). Empty for now — the fields are
 * US-99, the rules (search, Refresh, Discard) US-98. Focus moves to the title
 * when it opens; the shell's button gets it back when it closes.
 */
@Component({
  selector: 'app-new-product',
  imports: [StoqrTooltip],
  templateUrl: './new-product.html',
  styleUrl: './new-product.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewProduct {
  protected readonly navigation = inject(ProductNavigation);

  private readonly title = viewChild<ElementRef<HTMLElement>>('title');

  constructor() {
    afterNextRender(() => this.title()?.nativeElement.focus());
  }
}
