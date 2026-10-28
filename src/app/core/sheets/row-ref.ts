import { SheetKey } from '@core/config/app-environment';

/** Sheet-local `id` per ref. Held here, not on the object, so it cannot leak through a ref. */
const ROW_IDS = new WeakMap<RowRef, string>();

/**
 * Opaque handle for one row in one sheet (AI_CONTRACT: Products). Features pass
 * it back unchanged; the sheet's `id` inside it is readable only through
 * `rowRefId`, which only `core/sheets/` may call (architecture rule).
 */
export class RowRef {
  /** Nominal marker: a plain object cannot pass as a RowRef. */
  private readonly opaque = true;

  constructor(readonly sheet: SheetKey) {}
}

/** For `core/sheets/` only: wrap a sheet-local `id` (may be '' for a row missing one). */
export function createRowRef(sheet: SheetKey, id: string): RowRef {
  const ref = new RowRef(sheet);
  ROW_IDS.set(ref, id);
  return ref;
}

/** For `core/sheets/` only: the sheet-local `id` behind a ref, or undefined for a foreign ref. */
export function rowRefId(ref: RowRef): string | undefined {
  return ROW_IDS.get(ref);
}
