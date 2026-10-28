import { RowRef } from './row-ref';
import { LinkedPair, PairingResult, syncStatuses } from './sheet-pairing';

/** What the sync badge shows for a master product (US-37). */
export type SyncBadgeKind = 'linked' | 'master-only' | 'out-of-sync' | 'blocked';

export const SYNC_BADGE_LABELS: Readonly<Record<SyncBadgeKind, string>> = {
  linked: 'Linked',
  'master-only': 'Master only',
  'out-of-sync': 'Out of sync',
  blocked: 'Blocked',
};

/**
 * The single definition of "the two sheets disagree" for a linked product:
 * stock qty only (owner choice). A blank or invalid qty loads as null and
 * counts as a value, so null vs null agrees and null vs a number does not.
 */
export function linkedQtyDiffers(pair: LinkedPair): boolean {
  return pair.master.product.stockQty !== pair.drTrust.product.stockQty;
}

/**
 * Badge per master row, built on `syncStatuses`: a linked pair whose
 * quantities differ shows as out of sync. Display only — pairing and
 * `editability()` are unchanged, and an out-of-sync product stays editable.
 */
export function syncBadges(result: PairingResult): ReadonlyMap<RowRef, SyncBadgeKind> {
  const badges = new Map<RowRef, SyncBadgeKind>(syncStatuses(result));
  for (const pair of result.linked) {
    if (linkedQtyDiffers(pair)) {
      badges.set(pair.master.ref, 'out-of-sync');
    }
  }
  return badges;
}
