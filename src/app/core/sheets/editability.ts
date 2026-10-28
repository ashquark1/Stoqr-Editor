import { LoadedProduct, PRODUCT_ISSUE_LABELS } from '@core/models/product';
import { SyncStatus } from './sheet-pairing';

export const BLOCKED_SKU_REASON =
  'Not editable: this SKU appears more than once in Master or Dr Trust';

export interface Editability {
  readonly editable: boolean;
  /** Why not, in display order; empty when editable. */
  readonly reasons: readonly string[];
}

/**
 * The single rule for whether a product may be adjusted or edited
 * (AI_CONTRACT: Linked Sheets). Editable only with no row issues AND a SKU
 * that is not blocked. The picker, the adjuster and the details form all ask
 * this, so the rule lives in one place.
 */
export function editability(loaded: LoadedProduct, syncStatus: SyncStatus | undefined): Editability {
  const reasons = [
    ...loaded.issues.map((issue) => PRODUCT_ISSUE_LABELS[issue]),
    ...(syncStatus === 'blocked' ? [BLOCKED_SKU_REASON] : []),
  ];
  return { editable: reasons.length === 0, reasons };
}
