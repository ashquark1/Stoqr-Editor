import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { DETAIL_SECTIONS, DetailField, EDITABLE_DETAILS, byDetailField } from '@core/details/details-fields';
import { DetailsReviewStore } from '@core/details/details-review-store';
import { DetailsStore } from '@core/details/details-store';
import { ProductNavigation } from '@core/navigation/product-navigation';
import { ProductSearchStore } from '@core/search/product-search-store';
import { Badge } from '@shared/ui/badge/badge';
import { FormFooter } from '@shared/ui/form-footer/form-footer';
import { displayValue } from '@shared/util/display-value';
import { DetailsReview } from '../details-review/details-review';

/**
 * Every field of the selected product, in V1's groups (US-21, US-77: 1 / 2 / 3
 * columns), with inline validation (US-22). Editable fields are inputs (Stock
 * Qty included, US-63); Stock Status, Last Updated and Created At are shown,
 * never typed. A product that cannot be edited opens the same form read-only
 * with the reasons first (US-78). On open, focus goes to the first field (or
 * the heading when read-only). Texts and errors live in `DetailsStore`; Cancel
 * (or Close) leaves through `ProductNavigation`, which asks "Discard changes?"; Review changes opens the review (US-23), which
 * replaces the form while it is open. This component forwards input and renders.
 */
@Component({
  selector: 'app-details-form',
  imports: [Badge, DetailsReview, FormFooter, ReactiveFormsModule],
  templateUrl: './details-form.html',
  styleUrl: './details-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsForm {
  protected readonly details = inject(DetailsStore);
  protected readonly review = inject(DetailsReviewStore);
  protected readonly search = inject(ProductSearchStore);
  protected readonly navigation = inject(ProductNavigation);
  protected readonly sections = DETAIL_SECTIONS;
  protected readonly display = displayValue;

  protected readonly form = new FormGroup(
    byDetailField((field) => new FormControl(this.details.texts()[field], { nonNullable: true })),
  );
  private readonly typed = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  /** Footer status line (US-92): what is wrong, or how many fields changed; the New product form's own (US-99). */
  protected readonly footerStatus = computed(() => {
    if (this.details.isNew()) {
      return this.details.newValues() === null
        ? 'Fill the required fields (*) to continue.'
        : `Saves a new row to ${this.details.newTargets()}.`;
    }
    if (!this.details.hasChanges()) {
      return '';
    }
    if (!this.details.valid()) {
      return 'Fix the highlighted fields to continue.';
    }
    const count = this.details.changedFields().length;
    return `${count} field${count === 1 ? '' : 's'} changed`;
  });

  /**
   * A field's error as shown: always for a product's details; in the New
   * product form only once the field was typed in or left (US-99), so a blank
   * new form is not all red. The rule itself is `DetailsStore.errors`.
   */
  protected shownError(field: DetailField): string | undefined {
    const message = this.details.errors()[field];
    if (message === undefined || !this.details.isNew()) {
      return message;
    }
    const control = this.form.controls[field];
    return control.touched || control.dirty ? message : undefined;
  }

  private readonly section = viewChild<ElementRef<HTMLElement>>('formSection');
  private readonly heading = viewChild<ElementRef<HTMLElement>>('formTitle');

  constructor() {
    // Focus on open (US-77): the first input when editable, else the heading.
    afterNextRender(
      () => {
        const first = this.section()?.nativeElement.querySelector<HTMLElement>('input, textarea');
        (first ?? this.heading()?.nativeElement)?.focus();
      },
      { injector: inject(Injector) },
    );
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
