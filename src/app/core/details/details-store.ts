import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { AppConfig } from '@core/config/app-config';
import { LoadedProduct, Product } from '@core/models/product';
import { ProductSearchStore } from '@core/search/product-search-store';
import { SheetsStore } from '@core/sheets/sheets-store';
import { SkuCheck, checkNewSku } from '@core/sheets/sku-check';
import { DetailValue, changedValues, parseDetail } from './details-diff';
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
 * Details-form state for the selected product (US-21–24, US-36). Only the
 * user's EDITS are kept; every other field shows the product's current value,
 * so a field the user did not touch follows fresh data (after a conflict or a
 * save) and can never undo someone else's change. The component forwards what
 * is typed; the originals, the error per field, what changed and the "Discard
 * changes?" step live here. Resets whenever the selected product changes or
 * the selection clears (sign-out and a different account clear it; expiry does
 * not, so edits survive renewal).
 */
@Injectable({ providedIn: 'root' })
export class DetailsStore {
  private readonly search = inject(ProductSearchStore);
  private readonly sheets = inject(SheetsStore);
  private readonly config = inject(AppConfig);

  /** The values the form starts from: the selected product as loaded (or as last confirmed). */
  readonly original = computed<DetailTexts>(() => textsOf(this.search.selected()?.product ?? null));

  /** Typed text per field the user changed; a field typed back to its original is dropped. */
  private readonly editsSignal = signal<Readonly<Partial<Record<DetailField, string>>>>({});
  private readonly pendingLeaveSignal = signal<(() => void) | null>(null);

  /** What the form shows, per field: the user's edit, else the current value. */
  readonly texts = computed<DetailTexts>(() => {
    const edits = this.editsSignal();
    const original = this.original();
    return byDetailField((field) => edits[field] ?? original[field]);
  });

  /** The one editability rule (`editability()`), via the search store. */
  readonly editable = computed(() => this.search.selectedEditability()?.editable === true);
  readonly reasons = computed(() => this.search.selectedEditability()?.reasons ?? []);

  /**
   * A changed SKU checked against every other row of both sheets (US-38);
   * null while the SKU is unchanged.
   */
  readonly skuCheck = computed<SkuCheck | null>(() => {
    const selected = this.search.selected();
    const typed = this.texts().sku;
    if (selected === null || typed === this.original().sku) {
      return null;
    }
    return checkNewSku(
      typed,
      { master: selected, drTrust: this.search.selectedLink() },
      this.sheets.master(),
      this.sheets.drTrust(),
      { master: this.config.sheet('master').label, drTrust: this.config.sheet('dr-trust').label },
    );
  });

  /** The unmatched Dr Trust row the new SKU links this master-only product to, or null. */
  readonly linkTo = computed<LoadedProduct | null>(() => {
    const check = this.skuCheck();
    return check?.ok === true ? check.linkTo : null;
  });

  /** The message per invalid field (the SKU check included); fields that may be saved are absent. */
  readonly errors = computed<Readonly<Partial<Record<DetailField, string>>>>(() => {
    const texts = this.texts();
    const errors: Partial<Record<DetailField, string>> = {};
    for (const def of EDITABLE_DETAILS) {
      const message = validateDetail(def, texts[def.key]);
      if (message !== null) {
        errors[def.key] = message;
      }
    }
    const sku = this.skuCheck();
    if (errors.sku === undefined && sku !== null && !sku.ok) {
      errors.sku = sku.message;
    }
    return errors;
  });

  readonly valid = computed(() => Object.keys(this.errors()).length === 0);

  /**
   * The changed fields as the values that would be written (US-23), compared
   * by value: `18.0` for 18 is no change. Empty while any field is invalid.
   */
  readonly changes = computed<ReadonlyMap<DetailField, DetailValue>>(() => {
    const product = this.search.selected()?.product ?? null;
    if (product === null || !this.valid()) {
      return new Map();
    }
    const texts = this.texts();
    return changedValues(byDetailField((field) => parseDetail(defOf(field), texts[field])), product);
  });

  /** Fields whose text differs from the original, in form order (invalid text counts). */
  readonly changedFields = computed<readonly DetailField[]>(() => {
    const texts = this.texts();
    const original = this.original();
    const changes = this.changes();
    return EDITABLE_DETAILS.filter((def) =>
      this.valid() ? changes.has(def.key) : texts[def.key] !== original[def.key],
    ).map((def) => def.key);
  });

  readonly hasChanges = computed(() => this.editable() && this.changedFields().length > 0);

  /** Editable, changed and valid (a new SKU included): Review changes may open. */
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
   * Takes the form's values; a field left out keeps its current text. Reads
   * the originals untracked and writes with `update`, so a caller's effect
   * never subscribes to what it writes or to fresh data.
   */
  setTexts(typed: Readonly<Partial<Record<DetailField, string>>>): void {
    const original = untracked(() => this.original());
    this.editsSignal.update((edits) => {
      const next: Partial<Record<DetailField, string>> = { ...edits };
      for (const def of EDITABLE_DETAILS) {
        const text = typed[def.key];
        if (text === undefined) {
          continue;
        }
        if (text === original[def.key]) {
          delete next[def.key];
        } else {
          next[def.key] = text;
        }
      }
      return next;
    });
  }

  /** Drops every edit: each field shows its current value again. */
  reset(): void {
    this.editsSignal.set({});
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

function defOf(field: DetailField) {
  const def = EDITABLE_DETAILS.find((d) => d.key === field);
  if (def === undefined) {
    throw new Error(`Unknown detail field: ${field}`);
  }
  return def;
}
