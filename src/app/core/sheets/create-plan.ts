import { SheetDefinition } from '@core/config/app-environment';
import { LoadedProduct, Product } from '@core/models/product';
import { deriveStockStatus } from '@core/stock-adjust/stock-status';
import { NewProductValues } from './approval';
import { CellValue, SheetRows, mapSheet, resolveHeaders } from './data-mapping';
import { FIELD_LABELS, ID_LABEL } from './field-map';
import { formatSheetTimestamp, toSheetSerial } from './sheet-timestamp';
import { normalizeSku } from './sheet-pairing';
import { keepCellType } from './write-plan';

/** One sheet's new row, planned against its FRESHLY re-read tab (US-97). */
export interface CreatePlan {
  /** The row in the sheet's own column order; columns the app does not know stay blank. */
  readonly cells: readonly CellValue[];
  /** The new sheet-local id (highest numeric id + 1). Stays in `core/sheets/`. */
  readonly id: string;
  /** 0-based columns of Created At and Last Updated, for their date-time format. */
  readonly dateColumns: readonly number[];
  /** The row as the app will show it once confirmed. */
  readonly expected: Product;
}

/** Rows of a fresh tab already holding a SKU (normalised). */
export function rowsWithSku(sheet: SheetDefinition, values: SheetRows | undefined, sku: string): LoadedProduct[] {
  const key = normalizeSku(sku);
  return mapSheet(sheet, values).filter((row) => normalizeSku(row.product.sku) === key);
}

/** The same product, already added (an earlier append that went through): same SKU and product name. */
export function isSameProduct(row: LoadedProduct, values: NewProductValues): boolean {
  const name = (s: string) => s.trim().toLowerCase();
  return normalizeSku(row.product.sku) === normalizeSku(values.sku) && name(row.product.productName) === name(values.productName);
}

/**
 * Pure: the new row for one sheet (no I/O, inputs untouched). Headers are
 * resolved by label; the id is the highest numeric id in THAT sheet + 1 (1 when
 * none; non-numeric ids ignored); Stock Status is derived; Created At and Last
 * Updated are the same date serial. A text value is written as a number when
 * the column's last row holds a number and the text is a plain number (the
 * US-24 rule, so gviz / V1 keeps reading the column).
 */
export function planCreate(
  sheet: SheetDefinition,
  values: SheetRows | undefined,
  product: NewProductValues,
  now: Date,
): CreatePlan {
  const headerRow = values?.[0] ?? [];
  const header = resolveHeaders(sheet, headerRow);
  const columnOf = (label: string): number => header.get(label) ?? -1;
  const rows = (values ?? []).slice(1);
  const idColumn = columnOf(ID_LABEL);

  const ids = rows
    .map((row) => String(row[idColumn] ?? '').trim())
    .filter((text) => /^\d+$/.test(text))
    .map(Number);
  const id = String((ids.length === 0 ? 0 : Math.max(...ids)) + 1);
  const lastRow = [...rows].reverse().find((row) => row.some((cell) => String(cell).trim() !== ''));

  const status = deriveStockStatus(product.stockQty, product.lowStockThreshold);
  const serial = toSheetSerial(now);
  const shown = formatSheetTimestamp(now);
  const expected: Product = {
    ...product,
    stockStatus: status,
    createdAt: shown,
    lastUpdated: shown,
  };

  const cells: CellValue[] = Array.from({ length: headerRow.length }, () => '');
  cells[idColumn] = Number(id);
  for (const field of Object.keys(FIELD_LABELS) as (keyof Product)[]) {
    const column = columnOf(FIELD_LABELS[field]);
    if (field === 'stockStatus') {
      cells[column] = status;
    } else if (field === 'createdAt' || field === 'lastUpdated') {
      cells[column] = serial;
    } else {
      const value = product[field] ?? '';
      cells[column] = keepCellType(field, value, lastRow?.[column]);
    }
  }
  return {
    cells,
    id,
    dateColumns: [columnOf(FIELD_LABELS.createdAt), columnOf(FIELD_LABELS.lastUpdated)],
    expected,
  };
}
