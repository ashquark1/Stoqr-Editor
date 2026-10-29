import { LoadedProduct, Product } from '@core/models/product';
import { ProductChanges, RowChange } from '@core/sheets/approval';
import { deriveStockStatus } from '@core/stock-adjust/stock-status';
import { DetailField, EDITABLE_DETAILS, EditableDetail } from './details-fields';

/** A field's value as the sheet holds it: text, a number, or null (blank number). */
export type DetailValue = string | number | null;

/**
 * The value a VALID typed text stands for (US-23): text exactly as typed;
 * a number field's blank → null, otherwise the number. Call only after
 * `validateDetail` accepted the text.
 */
export function parseDetail(def: EditableDetail, typed: string): DetailValue {
  if (def.kind === 'text') {
    return typed;
  }
  const trimmed = typed.trim();
  return trimmed === '' ? null : Number(trimmed);
}

/** One changed field: Master's old value → the new one, and Dr Trust's old value when it differs. */
export interface DiffLine {
  readonly field: DetailField;
  readonly label: string;
  readonly from: DetailValue;
  readonly to: DetailValue;
  /** Present only for a linked product whose Dr Trust value differs from Master's. */
  readonly drTrustFrom?: DetailValue;
}

/** A Stock Status that will change on save (it is derived and written with every save). */
export interface StatusLine {
  readonly sheet: 'master' | 'dr-trust';
  readonly from: string;
  readonly to: string;
}

/** The changed fields as typed values, in form order (only the fields that differ from Master). */
export function changedValues(
  typed: Readonly<Record<DetailField, DetailValue>>,
  master: Product,
): ReadonlyMap<DetailField, DetailValue> {
  const changed = new Map<DetailField, DetailValue>();
  for (const def of EDITABLE_DETAILS) {
    if (typed[def.key] !== master[def.key]) {
      changed.set(def.key, typed[def.key]);
    }
  }
  return changed;
}

/** What the review lists (US-23): one line per changed field, Dr Trust's old value where it differs. */
export function diffLines(
  changed: ReadonlyMap<DetailField, DetailValue>,
  master: Product,
  drTrust: Product | null,
): readonly DiffLine[] {
  return EDITABLE_DETAILS.filter((def) => changed.has(def.key)).map((def) => {
    const line: DiffLine = { field: def.key, label: def.label, from: master[def.key], to: changed.get(def.key) ?? null };
    return drTrust !== null && drTrust[def.key] !== master[def.key] ? { ...line, drTrustFrom: drTrust[def.key] } : line;
  });
}

/** Stock Status lines for the sheets whose status the save will change (per sheet: its own qty and threshold). */
export function statusLines(
  changed: ReadonlyMap<DetailField, DetailValue>,
  master: Product,
  drTrust: Product | null,
): readonly StatusLine[] {
  const line = (sheet: StatusLine['sheet'], product: Product): StatusLine[] => {
    if (product.stockQty === null) {
      return [];
    }
    const typedThreshold = changed.get('lowStockThreshold');
    const threshold = changed.has('lowStockThreshold')
      ? typeof typedThreshold === 'number'
        ? typedThreshold
        : null
      : product.lowStockThreshold;
    const to = deriveStockStatus(product.stockQty, threshold);
    return to === product.stockStatus ? [] : [{ sheet, from: product.stockStatus, to }];
  };
  return [...line('master', master), ...(drTrust === null ? [] : line('dr-trust', drTrust))];
}

/**
 * One change per sheet (US-24, US-36): only the changed fields, the same new
 * values in both sheets, each guarded by THAT sheet's own current values of
 * those fields (so another person's edit to the same field stops the save,
 * and fields that already differ but were not edited are never written).
 */
export function detailRowChanges(
  changed: ReadonlyMap<DetailField, DetailValue>,
  master: LoadedProduct,
  drTrust: LoadedProduct | null,
): RowChange[] {
  // The single cast: every value came from `parseDetail` for its own field's kind.
  const changes = Object.fromEntries(changed) as ProductChanges;
  const guard = (product: Product): Partial<Product> =>
    Object.fromEntries([...changed.keys()].map((field) => [field, product[field]])) as Partial<Product>;
  const rows: RowChange[] = [{ target: master.ref, reviewed: guard(master.product), changes }];
  if (drTrust !== null) {
    rows.push({ target: drTrust.ref, reviewed: guard(drTrust.product), changes });
  }
  return rows;
}
