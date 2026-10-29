import { SheetDefinition } from '@core/config/app-environment';
import { LoadedProduct, Product } from '@core/models/product';
import { deriveStockStatus } from '@core/stock-adjust/stock-status';
import { cellRange } from './a1-range';
import { InvalidChangeError, RowChange, WritableField } from './approval';
import { CellValue, SheetRows, mapSheet, resolveHeaders } from './data-mapping';
import { FIELD_LABELS, ID_LABEL } from './field-map';
import { formatSheetTimestamp, toSheetSerial } from './sheet-timestamp';

/** One exact cell to write. `''` writes an empty cell (a blank number or text). */
export interface CellWrite {
  readonly field: keyof Product;
  readonly range: string;
  readonly value: CellValue;
}

/** A cell's 0-based grid position, as a format request addresses it. */
export interface GridCell {
  readonly rowIndex: number;
  readonly columnIndex: number;
}

export type WritePlan =
  | {
      readonly kind: 'ready';
      readonly writes: readonly CellWrite[];
      /** The Last Updated cell being stamped, for its date-time format (US-19 fix). */
      readonly stampCell: GridCell;
      /** The row as freshly re-read, before the write. */
      readonly current: LoadedProduct;
      /** The row as it will be once every write is confirmed. */
      readonly expected: Product;
    }
  | { readonly kind: 'conflict'; readonly current: LoadedProduct; readonly fields: readonly (keyof Product)[] }
  | { readonly kind: 'row-missing' }
  | { readonly kind: 'row-duplicated' };

/** Text fields: a blank is ''. Number fields: a blank is null. */
const NUMBER_FIELDS: ReadonlySet<keyof Product> = new Set<keyof Product>([
  'stockQty',
  'lowStockThreshold',
  'mrp',
  'sellingPrice',
  'purchasePrice',
  'taxRate',
]);

/**
 * Plans one approved row change against the FRESHLY re-read tab (pure: no I/O,
 * inputs untouched). Headers are re-resolved by label, so moved columns are
 * found; a missing column throws `SheetLoadError` ('columns'). The row is found
 * by its sheet-local `id` and must appear exactly once. Every reviewed value
 * must still equal the fresh one, else the plan is a conflict and nothing is
 * written. The app's own fields are added: Stock Status (derived) whenever
 * stock qty or threshold changes, and Last Updated on every write, whose grid
 * position is returned so the writer can give it a date-time format.
 */
export function planRowWrite(
  sheet: SheetDefinition,
  values: SheetRows | undefined,
  targetId: string,
  change: RowChange,
  now: Date,
): WritePlan {
  const header = resolveHeaders(sheet, values?.[0]);
  const columnOf = (label: string): number => header.get(label) ?? -1;
  const idColumn = columnOf(ID_LABEL);

  const matches = (values ?? [])
    .map((row, index) => ({ row, index }))
    .slice(1)
    .filter(({ row }) => targetId !== '' && String(row[idColumn] ?? '').trim() === targetId);
  if (matches.length === 0) {
    return { kind: 'row-missing' };
  }
  if (matches.length > 1) {
    return { kind: 'row-duplicated' };
  }
  const [{ row, index }] = matches;
  const rowNumber = index + 1; // values[0] is sheet row 1
  const [current] = mapSheet(sheet, [values?.[0] ?? [], row]);

  const changedUnderneath = (Object.keys(change.reviewed) as (keyof Product)[]).filter(
    (field) => change.reviewed[field] !== current.product[field],
  );
  if (changedUnderneath.length > 0) {
    return { kind: 'conflict', current, fields: changedUnderneath };
  }

  const cell = (field: keyof Product, value: CellValue): CellWrite => ({
    field,
    range: cellRange(sheet.tab, columnOf(FIELD_LABELS[field]), rowNumber),
    value,
  });

  const fields = Object.keys(change.changes) as WritableField[];
  const writes: CellWrite[] = fields.map((field) => cell(field, change.changes[field] ?? ''));
  const expected: Record<keyof Product, string | number | null> = { ...current.product };
  for (const field of fields) {
    expected[field] = change.changes[field] ?? (NUMBER_FIELDS.has(field) ? null : '');
  }

  if ('stockQty' in change.changes || 'lowStockThreshold' in change.changes) {
    const finalQty = 'stockQty' in change.changes ? change.changes.stockQty : current.product.stockQty;
    const finalThreshold =
      'lowStockThreshold' in change.changes
        ? (change.changes.lowStockThreshold ?? null)
        : current.product.lowStockThreshold;
    if (finalQty === null || finalQty === undefined) {
      throw new InvalidChangeError('Stock Status cannot be derived: the stock qty is blank or invalid.');
    }
    const status = deriveStockStatus(finalQty, finalThreshold);
    writes.push(cell('stockStatus', status));
    expected.stockStatus = status;
  }

  writes.push(cell('lastUpdated', toSheetSerial(now)));
  expected.lastUpdated = formatSheetTimestamp(now);
  const stampCell = { rowIndex: rowNumber - 1, columnIndex: columnOf(FIELD_LABELS.lastUpdated) };

  return { kind: 'ready', writes, stampCell, current, expected: toProduct(expected) };
}

/** Rebuilds a typed Product from the merged record (every key comes from a Product). */
function toProduct(record: Record<keyof Product, string | number | null>): Product {
  const text = (key: keyof Product) => String(record[key] ?? '');
  const num = (key: keyof Product) => {
    const value = record[key];
    return typeof value === 'number' ? value : null;
  };
  return {
    productName: text('productName'),
    brand: text('brand'),
    category: text('category'),
    subCategory: text('subCategory'),
    sku: text('sku'),
    size: text('size'),
    color: text('color'),
    unitOfMeasure: text('unitOfMeasure'),
    packing: text('packing'),
    stockQty: num('stockQty'),
    lowStockThreshold: num('lowStockThreshold'),
    stockStatus: text('stockStatus'),
    mrp: num('mrp'),
    sellingPrice: num('sellingPrice'),
    purchasePrice: num('purchasePrice'),
    taxRate: num('taxRate'),
    status: text('status'),
    notes: text('notes'),
    lastUpdated: text('lastUpdated'),
    createdAt: text('createdAt'),
  };
}
