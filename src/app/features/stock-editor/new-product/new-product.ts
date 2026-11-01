import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ProductNavigation } from '@core/navigation/product-navigation';
import { StoqrTooltip } from '@shared/ui/tooltip/tooltip';
import { DetailsForm } from '../details-form/details-form';

/**
 * The New product card (US-93, US-99): titled "New product" with the close X
 * (US-92's look), holding the details form in its `new` mode (lazy). The form
 * puts focus on its first field; the Add product button gets it back on close.
 * The rules (search, Refresh, Discard) are US-98's.
 */
@Component({
  selector: 'app-new-product',
  imports: [DetailsForm, StoqrTooltip],
  templateUrl: './new-product.html',
  styleUrl: './new-product.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewProduct {
  protected readonly navigation = inject(ProductNavigation);
}
