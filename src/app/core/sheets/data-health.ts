import { SheetKey } from '@core/config/app-environment';
import { LoadedProduct } from '@core/models/product';
import { RowRef } from './row-ref';
import { PairingResult } from './sheet-pairing';
import { linkedQtyDiffers } from './sync-badge';

/** One row named in a data-health list. `ref` is set only for Master rows (they can be picked). */
export interface HealthRow {
  readonly sheet: SheetKey;
  readonly sku: string;
  readonly name: string;
  readonly ref: RowRef | null;
}

/** A SKU repeated in either sheet: every row carrying it is blocked. */
export interface HealthDuplicate {
  readonly sku: string;
  readonly rows: readonly HealthRow[];
}

/** A linked product whose sheets hold different quantities (the sync badge's rule). */
export interface HealthQtyDiff {
  readonly row: HealthRow;
  readonly masterQty: number | null;
  readonly drTrustQty: number | null;
}

/** Where the two sheets disagree (US-31). Informational: nothing here blocks or writes anything. */
export interface DataHealth {
  readonly duplicates: readonly HealthDuplicate[];
  /** Dr Trust rows with no Master match (no SKU included). */
  readonly unmatched: readonly HealthRow[];
  /** Master-only products of the Dr Trust brand; null when no brand is configured. */
  readonly missingFromDrTrust: readonly HealthRow[] | null;
  readonly qtyDiffers: readonly HealthQtyDiff[];
  /** Rows in the four lists (a duplicate counts once per row). */
  readonly total: number;
}

const rowOf = (sheet: SheetKey, loaded: LoadedProduct): HealthRow => ({
  sheet,
  sku: loaded.product.sku,
  name: loaded.product.productName,
  ref: sheet === 'master' ? loaded.ref : null,
});

/** Brand comparison: trimmed, case-insensitive, inner spaces collapsed. */
const normalizeBrand = (brand: string) => brand.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The data-health lists, built only from the pairing (pure; display only).
 * `drTrustBrand` is the configured brand of the Dr Trust sheet's products
 * (`SheetDefinition.brand`); without it the "missing" list is null.
 */
export function dataHealth(pairing: PairingResult, drTrustBrand: string | undefined): DataHealth {
  const duplicates = pairing.blocked.map((blocked) => ({
    sku: blocked.rows[0]?.product.product.sku ?? blocked.sku,
    rows: blocked.rows.map((row) => rowOf(row.sheet, row.product)),
  }));
  const unmatched = pairing.orphans.map((row) => rowOf('dr-trust', row));
  const brand = drTrustBrand === undefined ? null : normalizeBrand(drTrustBrand);
  const missingFromDrTrust =
    brand === null
      ? null
      : pairing.masterOnly.filter((row) => normalizeBrand(row.product.brand) === brand).map((row) => rowOf('master', row));
  const qtyDiffers = pairing.linked.filter(linkedQtyDiffers).map((pair) => ({
    row: rowOf('master', pair.master),
    masterQty: pair.master.product.stockQty,
    drTrustQty: pair.drTrust.product.stockQty,
  }));
  const total =
    duplicates.reduce((sum, d) => sum + d.rows.length, 0) +
    unmatched.length +
    (missingFromDrTrust?.length ?? 0) +
    qtyDiffers.length;
  return { duplicates, unmatched, missingFromDrTrust, qtyDiffers, total };
}
