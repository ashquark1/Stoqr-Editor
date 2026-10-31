import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MultiSelectModule } from 'primeng/multiselect';

import { FilterOption } from '@core/search/product-filter';

/** Sentinel value for the synthetic "All" option (means "no filter"). */
const ALL = '__all__';

/**
 * Reusable multi-select filter dropdown — wraps PrimeNG `p-multiSelect`.
 *
 * Adds an explicit **"All"** option, selected by default, that is mutually
 * exclusive with the real options: selecting any real value clears "All";
 * selecting "All" clears the real values. "All" (= empty real selection) means
 * no filter. Emits the real selected values (empty array = All) to the parent.
 * `showSearch` adds an inline option search. Copied from V1 (US-70); the
 * Editor's options have no disabled state.
 */
@Component({
  selector: 'stoqr-filter-select',
  imports: [FormsModule, MultiSelectModule],
  templateUrl: './filter-select.html',
  styleUrl: './filter-select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterSelect {
  readonly label = input.required<string>();
  readonly options = input.required<readonly FilterOption[]>();
  /** Real selected values; empty = "All" (no filter). */
  readonly selected = input.required<readonly string[]>();
  readonly showSearch = input(false);

  readonly selectedChange = output<string[]>();

  /** Dropdown list: "All" first, then the real options. */
  protected readonly displayOptions = computed<FilterOption[]>(() => [
    { label: 'All', value: ALL },
    ...this.options(),
  ]);

  /** What the multiselect shows checked: the real values, or ["All"] when none. */
  protected readonly uiSelected = computed<string[]>(() =>
    this.selected().length ? [...this.selected()] : [ALL],
  );

  protected onChange(values: string[]): void {
    const added = values.filter((v) => !this.uiSelected().includes(v));
    if (added.includes(ALL)) {
      // User just picked "All" → clear to no filter.
      this.selectedChange.emit([]);
      return;
    }
    // Otherwise emit the real values; empty falls back to "All".
    this.selectedChange.emit(values.filter((v) => v !== ALL));
  }
}
