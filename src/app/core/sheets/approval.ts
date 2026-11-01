import { SheetKey } from '@core/config/app-environment';
import { Product } from '@core/models/product';
import { MAX_QUANTITY } from '@core/stock-adjust/stock-adjust';
import { isConfiguredBrand } from './data-health';
import { RowRef } from './row-ref';

/**
 * Fields a change may set: every product field except `createdAt` (never
 * written), and `stockStatus` / `lastUpdated`, which only the writer fills in
 * (derived / stamped). `id` is not a `Product` field at all.
 */
export type WritableField = Exclude<keyof Product, 'createdAt' | 'stockStatus' | 'lastUpdated'>;

export type ProductChanges = Partial<Pick<Product, WritableField>>;

/** What the user reviewed and approved for one row in one sheet. */
export interface RowChange {
  readonly target: RowRef;
  /** Values the user saw; the writer aborts if the fresh row differs in any of them. */
  readonly reviewed: Partial<Product>;
  /** The new values, by field. */
  readonly changes: ProductChanges;
}

/** Names that must never be in a change, even through a cast (runtime check). */
const FORBIDDEN_FIELDS: readonly string[] = ['id', 'createdAt', 'stockStatus', 'lastUpdated'];

/** Module-private: only `approve()` below can construct an `ApprovedChange`. */
const APPROVAL_KEY: unique symbol = Symbol('approval');

/**
 * A change the user has explicitly approved (AI_CONTRACT: no write without
 * approval). `SheetsWriter` accepts nothing else. It cannot be built outside
 * this file: the constructor needs a key that is never exported, and
 * `isGenuine` rejects lookalike objects.
 */
export class ApprovedChange {
  readonly #genuine = true;

  constructor(
    /** One row, or one row per sheet for a linked product (master first). */
    readonly rows: readonly RowChange[],
    key: typeof APPROVAL_KEY,
    /**
     * Every row of the user's ORIGINAL approval, kept by `remaining()`: a new
     * SKU may already be on these rows (one written before a Retry), never on
     * any other (US-38).
     */
    readonly owners: readonly RowRef[] = rows.map((row) => row.target),
  ) {
    if (key !== APPROVAL_KEY) {
      throw new Error('An ApprovedChange can only be created by approve().');
    }
  }

  /** True only for an object created by `approve()`. */
  static isGenuine(value: unknown): value is ApprovedChange {
    return value instanceof ApprovedChange && #genuine in value && value.#genuine;
  }

  /**
   * The rows of THIS approval not yet written — for Retry after a partial
   * write (US-34). Same targets and values, so retrying finishes the user's
   * original approval rather than making a new one. Refuses a forged source
   * and an empty result.
   */
  remaining(written: readonly SheetKey[]): ApprovedChange {
    if (!ApprovedChange.isGenuine(this)) {
      throw new InvalidChangeError('Only a genuine approval can be retried.');
    }
    const rows = this.rows.filter((row) => !written.includes(row.target.sheet));
    if (rows.length === 0) {
      throw new InvalidChangeError('Nothing left to write: every row is already written.');
    }
    return new ApprovedChange(Object.freeze(rows), APPROVAL_KEY, this.owners);
  }

  /** The new SKU this approval writes, or undefined when it does not change SKU. */
  newSku(): string | undefined {
    return this.rows.find((row) => 'sku' in row.changes)?.changes.sku;
  }
}

/** Thrown by `approve()` for a change that must never reach the writer. */
export class InvalidChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidChangeError';
  }
}

/**
 * Seals a reviewed change as approved: one row, or — for a linked product —
 * one row per sheet, master first, in ONE approval so both sheets are written
 * in the same action (AI_CONTRACT: Linked Sheets). Call ONLY from the review
 * step (`core/stock-adjust/`, `core/details/`) after the user's explicit
 * approval; an architecture rule enforces where it may be called. Refuses an
 * empty change, forbidden fields, and a stock qty that is not a whole number ≥ 0.
 */
export function approve(...rows: RowChange[]): ApprovedChange {
  if (rows.length < 1 || rows.length > 2) {
    throw new InvalidChangeError('An approval covers one row, or one row in each sheet.');
  }
  if (rows.length === 2 && (rows[0].target.sheet !== 'master' || rows[1].target.sheet !== 'dr-trust')) {
    throw new InvalidChangeError('A linked approval is one Master row, then one Dr Trust row.');
  }
  return new ApprovedChange(Object.freeze(rows.map(sealRow)), APPROVAL_KEY);
}

function sealRow(change: RowChange): RowChange {
  const fields = Object.keys(change.changes);
  if (fields.length === 0) {
    throw new InvalidChangeError('Nothing to write: the change is empty.');
  }
  const forbidden = fields.filter((f) => FORBIDDEN_FIELDS.includes(f));
  if (forbidden.length > 0) {
    throw new InvalidChangeError(`These fields are never written by a change: ${forbidden.join(', ')}.`);
  }
  const qty = change.changes.stockQty;
  if ('stockQty' in change.changes && (qty === null || qty === undefined || !Number.isInteger(qty) || qty < 0)) {
    throw new InvalidChangeError(`Stock qty must be a whole number ≥ 0, got ${String(qty)}.`);
  }
  const threshold = change.changes.lowStockThreshold;
  if (threshold !== undefined && threshold !== null && (!Number.isFinite(threshold) || threshold < 0)) {
    throw new InvalidChangeError(`Low stock threshold must be ≥ 0 or blank, got ${threshold}.`);
  }
  return Object.freeze({
    target: change.target,
    reviewed: Object.freeze({ ...change.reviewed }),
    changes: Object.freeze({ ...change.changes }),
  });
}

/** Every field a new product row takes from the user (US-97): all writable fields; Stock qty = opening stock. */
export type NewProductValues = Readonly<Pick<Product, WritableField>> & { readonly stockQty: number };

/** Text fields a new product may not leave blank (the details form's required list). */
const CREATE_REQUIRED_TEXT = [
  'brand',
  'productName',
  'category',
  'subCategory',
  'sku',
  'unitOfMeasure',
  'packing',
  'status',
] as const satisfies readonly WritableField[];

/** Module-private: only `approveCreate()` below can construct an `ApprovedCreate`. */
const CREATE_KEY: unique symbol = Symbol('approve-create');

/**
 * A new product the user explicitly approved with Save product (CR-05,
 * US-97). `SheetsWriter.create` accepts nothing else. Holds the typed values
 * and the sheets to append to: Master, plus Dr Trust for the configured Dr
 * Trust brand. The writer fills `id`, Stock Status, Created At and Last
 * Updated itself. `origin` is the user's original approval, kept through
 * `remaining()` so Retry finishes the same product rather than a new one.
 */
export class ApprovedCreate {
  readonly #genuine = true;
  readonly origin: ApprovedCreate;

  constructor(
    readonly values: NewProductValues,
    readonly sheets: readonly SheetKey[],
    key: typeof CREATE_KEY,
    origin?: ApprovedCreate,
  ) {
    if (key !== CREATE_KEY) {
      throw new Error('An ApprovedCreate can only be created by approveCreate().');
    }
    this.origin = origin ?? this;
  }

  /** True only for an object created by `approveCreate()`. */
  static isGenuine(value: unknown): value is ApprovedCreate {
    return value instanceof ApprovedCreate && #genuine in value && value.#genuine;
  }

  /** The sheets of THIS approval not yet appended to (Retry after a partial, US-97). */
  remaining(written: readonly SheetKey[]): ApprovedCreate {
    if (!ApprovedCreate.isGenuine(this)) {
      throw new InvalidChangeError('Only a genuine approval can be retried.');
    }
    const sheets = this.sheets.filter((key) => !written.includes(key));
    if (sheets.length === 0) {
      throw new InvalidChangeError('Nothing left to add: every sheet already has the product.');
    }
    return new ApprovedCreate(this.values, Object.freeze(sheets), CREATE_KEY, this.origin);
  }
}

/**
 * Seals a new product as approved (CR-05, US-97). Call ONLY from the New
 * product review in `core/details/`, after Save product. `drTrustBrand` is the
 * configured brand of the Dr Trust sheet: a product of that brand goes to
 * both sheets, any other to Master only. Refuses a blank required field, a SKU
 * with spaces at either end, an opening stock outside 0–1,000,000, a threshold
 * that is not a whole number ≥ 0, a negative tax rate, and any field the
 * writer fills in (`id`, Stock Status, Created At, Last Updated).
 */
export function approveCreate(values: NewProductValues, drTrustBrand: string | undefined): ApprovedCreate {
  const forbidden = Object.keys(values).filter((f) => FORBIDDEN_FIELDS.includes(f));
  if (forbidden.length > 0) {
    throw new InvalidChangeError(`These fields are filled in by the app: ${forbidden.join(', ')}.`);
  }
  const blank = CREATE_REQUIRED_TEXT.filter((f) => String(values[f] ?? '').trim() === '');
  if (blank.length > 0) {
    throw new InvalidChangeError(`These fields are required: ${blank.join(', ')}.`);
  }
  if (values.sku !== values.sku.trim()) {
    throw new InvalidChangeError('The SKU may not start or end with a space.');
  }
  const qty = values.stockQty;
  if (!Number.isInteger(qty) || qty < 0 || qty > MAX_QUANTITY) {
    throw new InvalidChangeError(`Opening stock must be a whole number from 0 to ${MAX_QUANTITY}, got ${String(qty)}.`);
  }
  const threshold = values.lowStockThreshold;
  if (threshold === null || !Number.isInteger(threshold) || threshold < 0) {
    throw new InvalidChangeError(`Low stock threshold must be a whole number ≥ 0, got ${String(threshold)}.`);
  }
  if (values.taxRate === null || !Number.isFinite(values.taxRate) || values.taxRate < 0) {
    throw new InvalidChangeError(`Tax rate must be a number ≥ 0, got ${String(values.taxRate)}.`);
  }
  const sheets: SheetKey[] = isConfiguredBrand(values.brand, drTrustBrand) ? ['master', 'dr-trust'] : ['master'];
  return new ApprovedCreate(Object.freeze({ ...values }), Object.freeze(sheets), CREATE_KEY);
}
