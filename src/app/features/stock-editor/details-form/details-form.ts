import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { DETAIL_SECTIONS, EDITABLE_DETAILS, byDetailField } from '@core/details/details-fields';
import { DetailsReviewStore } from '@core/details/details-review-store';
import { DetailsStore } from '@core/details/details-store';
import { ProductSearchStore } from '@core/search/product-search-store';
import { Badge } from '@shared/ui/badge/badge';
import { Modal } from '@shared/ui/modal/modal';
import { displayValue } from '@shared/util/display-value';
import { DetailsReview } from '../details-review/details-review';

/**
 * Every field of the selected product, in V1's groups (US-21), with inline
 * validation (US-22). Editable fields are inputs; Stock Qty, Stock Status,
 * Last Updated and Created At are shown, never typed. A product that cannot be
 * edited is shown read-only. Texts, errors and the "Discard changes?" step
 * live in `DetailsStore`; Review changes opens the review (US-23), which
 * replaces the form while it is open. This component forwards input and renders.
 */
@Component({
  selector: 'app-details-form',
  imports: [Badge, DetailsReview, Modal, ReactiveFormsModule],
  templateUrl: './details-form.html',
  styleUrl: './details-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsForm {
  protected readonly details = inject(DetailsStore);
  protected readonly review = inject(DetailsReviewStore);
  protected readonly search = inject(ProductSearchStore);
  protected readonly sections = DETAIL_SECTIONS;
  protected readonly display = displayValue;

  protected readonly form = new FormGroup(
    byDetailField((field) => new FormControl(this.details.texts()[field], { nonNullable: true })),
  );
  private readonly typed = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  constructor() {
    effect(() => this.details.setTexts(this.typed()));
    // When the store resets (Cancel, Discard, another product), put the boxes back too.
    effect(() => {
      const texts = this.details.texts();
      for (const { key } of EDITABLE_DETAILS) {
        const control = this.form.controls[key];
        if (control.value !== texts[key]) {
          control.setValue(texts[key], { emitEvent: false });
        }
      }
    });
  }
}
