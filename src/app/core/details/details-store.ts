import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { Product } from '@core/models/product';
import { ProductSearchStore } from '@core/search/product-search-store';
import { DetailField, EDITABLE_DETAILS, byDetailField } from './details-fields';
import { validateDetail } from './details-validation';

/** The typed text of every editable field. */
export type DetailTexts = Readonly<Record<DetailField, string>>;

/** A field's value as the form shows it: blank for null, numbers as plain digits. */
function textsOf(product: Product | null): DetailTexts {
  return byDetailField((field) => {
    const value = product?.[field] ?? null;
    return value === null ? '' : String(value);
  });
}

/**
 * Details-form state for the selected product (US-21, US-22). The component
 * forwards what is typed; the originals, the error per field, whether anything
 * changed and the "Discard changes?" step live here. Resets whenever the
 * selected product changes or the selection clears (sign-out and a different
 * account clear it; expiry does not, so edits survive renewal).
 */
@Injectable({ providedIn: 'root' })
export class DetailsStore {
  private readonly search = inject(ProductSearchStore);

  /** The values the form started from. */
  readonly original = computed<DetailTexts>(() => textsOf(this.search.selected()?.product ?? null));

  private readonly textsSignal = signal<DetailTexts>(untracked(() => this.original()));
  private readonly pendingLeaveSignal = signal<(() => void) | null>(null);

  /** What is typed, per field. */
  readonly texts = this.textsSignal.asReadonly();

  /** The one editability rule (`editability()`), via the search store. */
  readonly editable = computed(() => this.search.selectedEditability()?.editable === true);
  readonly reasons = computed(() => this.search.selectedEditability()?.reasons ?? []);

  /** The message per invalid field; fields that may be saved are absent. */
  readonly errors = computed<Readonly<Partial<Record<DetailField, string>>>>(() => {
    const texts = this.textsSignal();
    const errors: Partial<Record<DetailField, string>> = {};
    for (const def of EDITABLE_DETAILS) {
      const message = validateDetail(def, texts[def.key]);
      if (message !== null) {
        errors[def.key] = message;
      }
    }
    return errors;
  });

  readonly valid = computed(() => Object.keys(this.errors()).length === 0);

  /** Fields whose text differs from the original, in form order. */
  readonly changedFields = computed<readonly DetailField[]>(() => {
    const texts = this.textsSignal();
    const original = this.original();
    return EDITABLE_DETAILS.filter((def) => texts[def.key] !== original[def.key]).map((def) => def.key);
  });

  readonly hasChanges = computed(() => this.editable() && this.changedFields().length > 0);

  /** Editable, changed and valid: Review changes may open (wired in US-23). */
  readonly canReview = computed(() => this.hasChanges() && this.valid());

  /** True while "Discard changes?" waits for an answer. */
  readonly leavePending = computed(() => this.pendingLeaveSignal() !== null);

  constructor() {
    let lastRef = untracked(() => this.search.selected()?.ref ?? null);
    effect(() => {
      const ref = this.search.selected()?.ref ?? null;
      if (ref !== lastRef) {
        lastRef = ref;
        untracked(() => {
          this.reset();
          this.pendingLeaveSignal.set(null);
        });
      }
    });
  }

  /**
   * Takes the form's values; a field left out keeps its current text. Uses
   * `update` so a caller's effect never subscribes to the texts it writes.
   */
  setTexts(typed: Readonly<Partial<Record<DetailField, string>>>): void {
    this.textsSignal.update((current) => byDetailField((field) => typed[field] ?? current[field]));
  }

  /** Puts every field back to its original value. */
  reset(): void {
    this.textsSignal.set(this.original());
  }

  /** Runs `leave` now when nothing changed; otherwise asks "Discard changes?" first. */
  confirmLeave(leave: () => void): void {
    if (this.hasChanges()) {
      this.pendingLeaveSignal.set(leave);
    } else {
      leave();
    }
  }

  /** Answer to "Discard changes?": drop the edits, then leave. */
  discardAndLeave(): void {
    const leave = this.pendingLeaveSignal();
    this.pendingLeaveSignal.set(null);
    this.reset();
    leave?.();
  }

  /** Answer to "Discard changes?": stay, edits kept. */
  keepEditing(): void {
    this.pendingLeaveSignal.set(null);
  }
}
