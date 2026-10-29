import { SheetDefinition } from '@core/config/app-environment';
import { LoadedProduct } from '@core/models/product';
import { CellValue, mapSheet } from './data-mapping';
import { RowRef, rowRefId } from './row-ref';
import { normalizeSku } from './sheet-pairing';

/** Result of checking a typed SKU against the loaded sheets (US-38). */
export type SkuCheck =
  /** May be saved. `linkTo`: the unmatched Dr Trust row this SKU links a master-only product to. */
  | { readonly ok: true; readonly linkTo: LoadedProduct | null }
  | { readonly ok: false; readonly message: string };

export const SKU_SPACES_MESSAGE = "SKU can't start or end with a space.";

const nameOf = (row: LoadedProduct) => row.product.productName.trim() || 'no name';

/**
 * Whether a product may take a new SKU (pure; AI_CONTRACT: Linked Sheets).
 * Compared normalised (trimmed, case-insensitive), against every OTHER row of
 * both sheets — the product's own Master row and linked Dr Trust row never
 * count, so a case-only change is allowed. Owner choice (2026-10-29): a
 * master-only product may take the SKU of exactly one unmatched Dr Trust row,
 * which links them. A linked product may not (its Dr Trust row would then
 * share the SKU with another row). Spaces at either end are refused, never
 * trimmed. Never compares `id`.
 */
export function checkNewSku(
  typed: string,
  own: { readonly master: LoadedProduct; readonly drTrust: LoadedProduct | null },
  master: readonly LoadedProduct[],
  drTrust: readonly LoadedProduct[],
  labels: { readonly master: string; readonly drTrust: string },
): SkuCheck {
  if (typed !== typed.trim()) {
    return { ok: false, message: SKU_SPACES_MESSAGE };
  }
  const key = normalizeSku(typed);
  if (key === '' || key === normalizeSku(own.master.product.sku)) {
    return { ok: true, linkTo: null };
  }
  const holds = (row: LoadedProduct) => normalizeSku(row.product.sku) === key;

  const inMaster = master.filter((row) => row.ref !== own.master.ref && holds(row));
  if (inMaster.length > 0) {
    return { ok: false, message: `SKU ${typed} is already used in ${labels.master} (${nameOf(inMaster[0])}).` };
  }
  const inDrTrust = drTrust.filter((row) => row.ref !== own.drTrust?.ref && holds(row));
  if (inDrTrust.length === 0) {
    return { ok: true, linkTo: null };
  }
  if (own.drTrust !== null) {
    return { ok: false, message: `SKU ${typed} is already used in ${labels.drTrust} (${nameOf(inDrTrust[0])}).` };
  }
  if (inDrTrust.length > 1) {
    return { ok: false, message: `SKU ${typed} is used by more than one row in ${labels.drTrust}.` };
  }
  return { ok: true, linkTo: inDrTrust[0] };
}

/**
 * Save-time re-check on a FRESHLY read tab (US-38): the name of a product that
 * now holds `sku` (normalised) and is not one of the approval's own rows, or
 * null when none does.
 */
export function freshSkuHolder(
  sheet: SheetDefinition,
  values: CellValue[][] | undefined,
  sku: string,
  owners: readonly RowRef[],
): string | null {
  const key = normalizeSku(sku);
  const ownIds = owners.filter((ref) => ref.sheet === sheet.key).map((ref) => rowRefId(ref));
  const holder = mapSheet(sheet, values).find(
    (row) => !ownIds.includes(rowRefId(row.ref)) && normalizeSku(row.product.sku) === key,
  );
  return holder === undefined ? null : nameOf(holder);
}
