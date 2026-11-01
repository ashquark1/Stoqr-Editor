import { LoadedProduct } from '@core/models/product';
import { SYNC_BADGE_LABELS, SyncBadgeKind } from '@core/sheets/sync-badge';
import { StockVariant, resolveStockVariant, stockLabel } from '@core/stock-adjust/stock-status-display';

/** What one result row shows beyond the product's own fields (US-91). Display only. */
export interface ResultRow {
  readonly row: LoadedProduct;
  readonly sync: SyncBadgeKind | undefined;
  /** The coloured left edge: the stock level, or grey for a blocked product. */
  readonly edge: StockVariant | 'blocked';
  /** The stock level as a pill variant (Stock tile, phone Qty tile). */
  readonly stock: StockVariant;
  /** The sheet's Stock Status text (desktop Stock tile). */
  readonly stockText: string;
  /** The phone Qty tile's word: "In stock", "Low stock", "Out of stock" (else the sheet text). */
  readonly stockWord: string;
  /** Phones show a sync flag only when the product is not plainly Linked. */
  readonly flag: boolean;
  /** The row button's accessible name: name, SKU, quantity, stock status, sync. */
  readonly label: string;
}

const STOCK_WORDS: Readonly<Partial<Record<StockVariant, string>>> = {
  'in-stock': 'In stock',
  'low-stock': 'Low stock',
  'out-of-stock': 'Out of stock',
};

/** Pure: the row view for one master product and its sync badge. */
export function resultRow(row: LoadedProduct, sync: SyncBadgeKind | undefined): ResultRow {
  const { product } = row;
  const stock = resolveStockVariant(product.stockStatus);
  const stockText = stockLabel(product.stockStatus);
  const qty = product.stockQty === null ? 'no quantity' : `quantity ${product.stockQty}`;
  const parts = [product.productName || 'Unnamed product', product.sku ? `SKU ${product.sku}` : 'no SKU', qty, stockText];
  if (sync !== undefined) {
    parts.push(SYNC_BADGE_LABELS[sync]);
  }
  return {
    row,
    sync,
    edge: sync === 'blocked' ? 'blocked' : stock,
    stock,
    stockText,
    stockWord: STOCK_WORDS[stock] ?? stockText,
    flag: sync !== undefined && sync !== 'linked',
    label: parts.join(', '),
  };
}
