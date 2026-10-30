import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { ProductSearchStore } from '@core/search/product-search-store';

/**
 * V1-style search row (US-50): the box, a clear (×) inside it and the Search
 * button, across the full content width under the top bar. The query lives in
 * `ProductSearchStore`; this component only forwards what is typed, cleared or
 * submitted. When a search runs is US-56; the clear rules with a product open
 * are US-59.
 */
@Component({
  selector: 'app-search-row',
  imports: [ReactiveFormsModule],
  templateUrl: './search-row.html',
  styleUrl: './search-row.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchRow {
  protected readonly search = inject(ProductSearchStore);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  /** Starts from the store's query, so returning to the page keeps it. */
  protected readonly queryControl = new FormControl(this.search.query(), { nonNullable: true });
  private readonly typed = toSignal(this.queryControl.valueChanges, {
    initialValue: this.queryControl.value,
  });

  constructor() {
    effect(() => this.search.setQuery(this.typed()));
    // When the store clears the query (a new session), clear the box too.
    effect(() => {
      const query = this.search.query();
      if (query !== this.queryControl.value) {
        this.queryControl.setValue(query, { emitEvent: false });
      }
    });
  }

  /** Search button and Enter: send the box's text now (US-56 adds the run rules). */
  protected submit(): void {
    this.search.setQuery(this.queryControl.value);
  }

  /** Clear (×): empty the box and the results, and put focus back in the box. */
  protected clear(): void {
    this.queryControl.setValue('');
    this.input().nativeElement.focus();
  }
}
