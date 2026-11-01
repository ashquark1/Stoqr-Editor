import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { AppConfig } from '@core/config/app-config';
import { PanelStore } from '@core/layout/panel-store';
import { LoadedProduct, Product } from '@core/models/product';
import { ProductSearchStore } from '@core/search/product-search-store';
import { NewProductValues } from '@core/sheets/approval';
import { isConfiguredBrand } from '@core/sheets/data-health';
import { SheetsStore } from '@core/sheets/sheets-store';
import { SkuCheck, checkNewSku, checkSkuForNew } from '@core/sheets/sku-check';
import { StockLogStore } from '@core/stock-adjust/stock-log-store';
import { DetailValue, changedValues, parseDetail } from './details-diff';
import { DetailField, EDITABLE_DETAILS, byDetailField } from './details-fields';
import { validateDetail } from './details-validation';

/** The typed text of every editable field. */
export type DetailTexts = Readonly<Record<DetailField, string>>;

/** Which form the store holds: edits over the open product, or a NEW product (US-98). */
export type DetailsMode = 'product' | 'new';

/** The New product form's starting texts: every field blank except Status = Active (A-UI-65). */
const NEW_TEMPLATE: DetailTexts = byDetailField((field) => (field === 'status' ? 'Active' : ''));

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
 * is typed; the originals, the error per field and what changed live here.
 * Edits reset whenever the selected row changes (a refresh included) or the
 * selection clears (sign-out and a different account clear it; expiry does
 * not, so edits survive renewal). Whether the form is open (US-66) resets only
 * when another product opens or it closes, so a refresh keeps it open. The
 * "Discard changes?" question is `ProductNavigation`'s.
 */
@Injectable({ providedIn: 'root' })
export class DetailsStore {
  private readonly search = inject(ProductSearchStore);
  private readonly sheets = inject(SheetsStore);
  private readonly config = inject(AppConfig);
  private readonly log = inject(StockLogStore);
  private readonly panels = inject(PanelStore);

  private readonly modeSignal = signal<DetailsMode>('product');
  /** `new` while the New product form is open (US-98); entered through `ProductNavigation`. */
  readonly mode = this.modeSignal.asReadonly();
  readonly isNew = computed(() => this.modeSignal() === 'new');

  /**
   * The values the form starts from: the selected product as loaded (or as
   * last confirmed); in `new` mode, the New product template.
   */
  readonly original = computed<DetailTexts>(() =>
    this.isNew() ? NEW_TEMPLATE : textsOf(this.search.selected()?.product ?? null),
  );

  /** Typed text per field the user changed; a field typed back to its original is dropped. */
  private readonly editsSignal = signal<Readonly<Partial<Record<DetailField, string>>>>({});
  private readonly formOpenSignal = signal(false);

  /** The details form is open (US-66). */
  readonly formOpen = this.formOpenSignal.asReadonly();

  /** What the form shows, per field: the user's edit, else the current value. */
  readonly texts = computed<DetailTexts>(() => {
    const edits = this.editsSignal();
    const original = this.original();
    return byDetailField((field) => edits[field] ?? original[field]);
  });

  /** The one editability rule (`editability()`), via the search store. */
  readonly editable = computed(() => this.isNew() || this.search.selectedEditability()?.editable === true);
  readonly reasons = computed(() => (this.isNew() ? [] : (this.search.selectedEditability()?.reasons ?? [])));
  /** The form shows read-only: the product can't be edited (US-66, the eye icon in US-74). */
  readonly readOnly = computed(() => !this.editable());

  /**
   * A changed SKU checked against every other row of both sheets (US-38);
   * null while the SKU is unchanged.
   */
  readonly skuCheck = computed<SkuCheck | null>(() => {
    const labels = { master: this.config.sheet('master').label, drTrust: this.config.sheet('dr-trust').label };
    if (this.isNew()) {
      // A new product's SKU must be new to BOTH sheets (no orphan link; US-98).
      return checkSkuForNew(this.texts().sku, this.sheets.master(), this.sheets.drTrust(), labels);
    }
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
      labels,
    );
  });

  /** The unmatched Dr Trust row the new SKU links this master-only product to, or null. */
  readonly linkTo = computed<LoadedProduct | null>(() => {
    const check = this.skuCheck();
    return check?.ok === true ? check.linkTo : null;
  });

  /** Stock qty may not change: no Stock Log access (US-95). The reason is `stockQtyLockedReason`. */
  readonly stockQtyLocked = this.log.stockChangesOff;
  /** The no-access message shown under the read-only Stock qty (US-96). */
  readonly stockQtyLockedReason = this.log.offMessage;

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
    // No Stock Log access: a changed Stock qty blocks Review (other fields still save; US-95).
    const locked = this.stockQtyLockedReason();
    if (locked !== null && texts.stockQty !== this.original().stockQty) {
      errors.stockQty = locked;
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
    if (this.isNew() || product === null || !this.valid()) {
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

  /** Anything typed in the New product form (Status left at Active is not; US-98). */
  readonly newDirty = computed(() => {
    if (!this.isNew()) {
      return false;
    }
    const texts = this.texts();
    return EDITABLE_DETAILS.some((def) => texts[def.key] !== NEW_TEMPLATE[def.key]);
  });

  /** Unsaved work in this form: product edits, or anything typed in the New product form. */
  readonly hasChanges = computed(() =>
    this.isNew() ? this.newDirty() : this.editable() && this.changedFields().length > 0,
  );

  /** Editable, changed and valid (a new SKU included): Review changes may open. Product mode only. */
  readonly canReview = computed(() => !this.isNew() && this.hasChanges() && this.valid());

  /** The New product values for `approveCreate()` (US-97), or null while anything is invalid. */
  readonly newValues = computed<NewProductValues | null>(() => {
    if (!this.isNew() || !this.valid()) {
      return null;
    }
    const texts = this.texts();
    const parsed = byDetailField((field) => parseDetail(defOf(field), texts[field]));
    const qty = parsed.stockQty;
    if (typeof qty !== 'number') {
      return null;
    }
    // The single cast: every value came from `parseDetail` for its own field's kind.
    return { ...(parsed as unknown as NewProductValues), stockQty: qty };
  });

  /** Where a new product is saved: "Master and Dr Trust" for the Dr Trust brand, else "Master". */
  readonly newTargets = computed(() => {
    const master = this.config.sheet('master').label;
    const drTrust = this.config.sheet('dr-trust');
    return isConfiguredBrand(this.texts().brand, drTrust.brand) ? `${master} and ${drTrust.label}` : master;
  });

  constructor() {
    let lastRef = untracked(() => this.search.selected()?.ref ?? null);
    effect(() => {
      const ref = this.search.selected()?.ref ?? null;
      if (ref !== lastRef) {
        lastRef = ref;
        untracked(() => this.reset());
      }
    });
    // The New product shell closed (X / Cancel, a product opened, sign-out): leave `new` and drop the entries.
    effect(() => {
      if (!this.panels.newProductOpen() && untracked(() => this.isNew())) {
        untracked(() => this.leaveNew());
      }
    });
    // Another product, or none: the form closes (US-66). A refresh keeps the key.
    let lastKey = untracked(() => this.search.selectionKey());
    effect(() => {
      const key = this.search.selectionKey();
      if (key !== lastKey) {
        lastKey = key;
        untracked(() => this.formOpenSignal.set(false));
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

  /** Starts a blank New product form (through `ProductNavigation`, US-98); product edits are dropped. */
  startNew(): void {
    this.editsSignal.set({});
    this.formOpenSignal.set(false);
    this.modeSignal.set('new');
  }

  /** Back to product mode, dropping the New product entries. */
  private leaveNew(): void {
    this.editsSignal.set({});
    this.modeSignal.set('product');
  }

  /** Opens the form (through `ProductNavigation.openDetails`). */
  openForm(): void {
    this.formOpenSignal.set(true);
  }

  /** Closes the form and drops the edits (Cancel after "Discard changes?", or the half-saved Close). */
  closeForm(): void {
    this.reset();
    this.formOpenSignal.set(false);
  }
}

function defOf(field: DetailField) {
  const def = EDITABLE_DETAILS.find((d) => d.key === field);
  if (def === undefined) {
    throw new Error(`Unknown detail field: ${field}`);
  }
  return def;
}
