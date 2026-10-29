import { SheetKey } from '@core/config/app-environment';
import { Product } from '@core/models/product';
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
