import { SheetKey } from '@core/config/app-environment';
import { LoadedProduct } from '@core/models/product';
import { RowRef } from './row-ref';

/** How a master product relates to the Dr Trust sheet (US-30). */
export type SyncStatus = 'linked' | 'master-only' | 'blocked';

/** The same product in both sheets: its SKU appears exactly once in each. */
export interface LinkedPair {
  readonly master: LoadedProduct;
  readonly drTrust: LoadedProduct;
}

/** A SKU repeated in either sheet: every row carrying it, in both sheets, is blocked. */
export interface BlockedSku {
  /** Normalised SKU. */
  readonly sku: string;
  readonly rows: readonly { readonly sheet: SheetKey; readonly product: LoadedProduct }[];
}

export interface PairingResult {
  readonly linked: readonly LinkedPair[];
  /** Master rows whose SKU is not in Dr Trust, including master rows with no SKU. */
  readonly masterOnly: readonly LoadedProduct[];
  readonly blocked: readonly BlockedSku[];
  /** Dr Trust rows with no master match, including Dr Trust rows with no SKU. */
  readonly orphans: readonly LoadedProduct[];
}

export interface PairingCounts {
  readonly linked: number;
  readonly masterOnly: number;
  readonly blockedSkus: number;
  readonly blockedRows: number;
  readonly unmatchedDrTrust: number;
}

/** The pairing key: trimmed and case-insensitive, nothing else (no punctuation rewriting). */
export function normalizeSku(sku: string): string {
  return sku.trim().toLowerCase();
}

/** False when the SKU is blank: such a row never pairs and never counts as a duplicate. */
export function hasSku(loaded: LoadedProduct): boolean {
  return normalizeSku(loaded.product.sku) !== '';
}

/**
 * Pairs the two sheets by normalised SKU (AI_CONTRACT: Linked Sheets). Pure:
 * inputs are not mutated and input order is kept. Never compares `id`,
 * `RowRef`, row number or product name; refs are carried through untouched.
 * Every input row lands in exactly one bucket.
 */
export function pairSheets(
  master: readonly LoadedProduct[],
  drTrust: readonly LoadedProduct[],
): PairingResult {
  const masterCounts = countSkus(master);
  const drTrustCounts = countSkus(drTrust);
  const isBlocked = (sku: string) =>
    (masterCounts.get(sku) ?? 0) > 1 || (drTrustCounts.get(sku) ?? 0) > 1;

  const drTrustBySku = new Map<string, LoadedProduct>();
  drTrust.forEach((row) => drTrustBySku.set(normalizeSku(row.product.sku), row));

  const linked: LinkedPair[] = [];
  const masterOnly: LoadedProduct[] = [];
  const orphans: LoadedProduct[] = [];
  const blockedGroups = new Map<string, { sheet: SheetKey; product: LoadedProduct }[]>();
  const block = (sku: string, sheet: SheetKey, product: LoadedProduct) =>
    blockedGroups.set(sku, [...(blockedGroups.get(sku) ?? []), { sheet, product }]);

  for (const row of master) {
    const sku = normalizeSku(row.product.sku);
    const match = drTrustBySku.get(sku);
    if (sku === '') {
      masterOnly.push(row);
    } else if (isBlocked(sku)) {
      block(sku, 'master', row);
    } else if (match !== undefined) {
      linked.push({ master: row, drTrust: match });
    } else {
      masterOnly.push(row);
    }
  }

  for (const row of drTrust) {
    const sku = normalizeSku(row.product.sku);
    if (sku === '') {
      orphans.push(row);
    } else if (isBlocked(sku)) {
      block(sku, 'dr-trust', row);
    } else if (!masterCounts.has(sku)) {
      orphans.push(row);
    }
    // Otherwise it is already in its linked pair.
  }

  return {
    linked,
    masterOnly,
    blocked: [...blockedGroups].map(([sku, rows]) => ({ sku, rows })),
    orphans,
  };
}

/** Status of each master row, keyed by its RowRef (for the picker and the sync badge). */
export function syncStatuses(result: PairingResult): ReadonlyMap<RowRef, SyncStatus> {
  const statuses = new Map<RowRef, SyncStatus>();
  result.linked.forEach((pair) => statuses.set(pair.master.ref, 'linked'));
  result.masterOnly.forEach((row) => statuses.set(row.ref, 'master-only'));
  result.blocked.forEach((group) =>
    group.rows
      .filter((row) => row.sheet === 'master')
      .forEach((row) => statuses.set(row.product.ref, 'blocked')),
  );
  return statuses;
}

export function pairingCounts(result: PairingResult): PairingCounts {
  return {
    linked: result.linked.length,
    masterOnly: result.masterOnly.length,
    blockedSkus: result.blocked.length,
    blockedRows: result.blocked.reduce((sum, group) => sum + group.rows.length, 0),
    unmatchedDrTrust: result.orphans.length,
  };
}

/** Non-blank normalised SKU -> number of rows carrying it. */
function countSkus(rows: readonly LoadedProduct[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const sku = normalizeSku(row.product.sku);
    if (sku !== '') {
      counts.set(sku, (counts.get(sku) ?? 0) + 1);
    }
  }
  return counts;
}
