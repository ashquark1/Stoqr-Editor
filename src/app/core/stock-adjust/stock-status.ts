/** The sheet's exact Stock Status texts (confirmed by the owner, DECISIONS 2026-10-27). */
export type StockStatusLabel = 'In Stock' | 'Low Stock' | 'Out of Stock';

/**
 * The ONE rule for Stock Status, which is typed text in the sheet and so is
 * derived and written by the app with every quantity change (and whenever the
 * Low Stock Threshold changes). Never computed in a component.
 *
 * - qty = 0 → Out of Stock
 * - 0 < qty < threshold → Low Stock
 * - qty ≥ threshold → In Stock (equal to the threshold is In Stock)
 * - no threshold and qty > 0 → In Stock
 *
 * A qty that is not a whole number ≥ 0 is refused: it is never clamped.
 */
export function deriveStockStatus(qty: number, lowStockThreshold: number | null): StockStatusLabel {
  if (!Number.isInteger(qty) || qty < 0) {
    throw new RangeError(`Stock qty must be a whole number ≥ 0, got ${qty}`);
  }
  if (qty === 0) {
    return 'Out of Stock';
  }
  return lowStockThreshold !== null && qty < lowStockThreshold ? 'Low Stock' : 'In Stock';
}
