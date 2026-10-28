import { SheetDefinition } from '@core/config/app-environment';
import { LoadedProduct, Product, ProductIssue } from '@core/models/product';
import { FIELD_LABELS, ID_LABEL, REQUIRED_LABELS, normalizeLabel } from './field-map';
import { createRowRef } from './row-ref';
import { SheetLoadError } from './sheet-load-error';

/** A cell as the Sheets API returns it with `valueRenderOption=UNFORMATTED_VALUE`. */
export type CellValue = string | number | boolean;
export type SheetRows = readonly (readonly CellValue[])[];

/**
 * Finds each required header's column index by label. Unknown extra columns are
 * ignored. A missing or repeated required label throws, naming the sheet and
 * every label involved, so no partial data is ever produced (US-09).
 */
export function resolveHeaders(
  sheet: SheetDefinition,
  headerRow: readonly CellValue[] | undefined,
): ReadonlyMap<string, number> {
  const positions = new Map<string, number[]>();
  (headerRow ?? []).forEach((cell, index) => {
    const label = normalizeLabel(cell);
    positions.set(label, [...(positions.get(label) ?? []), index]);
  });

  const missing = REQUIRED_LABELS.filter((label) => !positions.has(label));
  const duplicated = REQUIRED_LABELS.filter((label) => (positions.get(label)?.length ?? 0) > 1);
  if (missing.length > 0 || duplicated.length > 0) {
    const problems = [
      ...(missing.length > 0 ? [`is missing ${columns(missing)}`] : []),
      ...(duplicated.length > 0 ? [`has duplicate ${columns(duplicated)}`] : []),
    ];
    throw new SheetLoadError(sheet.label, 'columns', `${sheet.label} sheet ${problems.join(' and ')}`);
  }

  return new Map(REQUIRED_LABELS.map((label) => [label, positions.get(label)?.[0] ?? -1]));
}

function columns(labels: readonly string[]): string {
  return `${labels.length === 1 ? 'column' : 'columns'}: ${labels.join(', ')}`;
}

/**
 * Maps one sheet's rows (header first) into products. Pure: no I/O, input not
 * mutated, row order kept. Blank rows are skipped; short rows are padded. Rows
 * with a blank or repeated `id`, or a stock qty that is not a whole number >= 0
 * (blank included), are kept but carry issues and are not editable.
 */
export function mapSheet(sheet: SheetDefinition, values: SheetRows | undefined): LoadedProduct[] {
  const header = resolveHeaders(sheet, values?.[0]);
  const rows = (values ?? []).slice(1).filter((row) => !isBlankRow(row));

  const cellIn = (row: readonly CellValue[], label: string): CellValue | undefined =>
    row[header.get(label) ?? -1];

  const ids = rows.map((row) => toText(cellIn(row, ID_LABEL)).trim());
  const idCounts = new Map<string, number>();
  ids.forEach((id) => idCounts.set(id, (idCounts.get(id) ?? 0) + 1));

  return rows.map((row, i) => {
    const text = (key: keyof Product) => toText(cellIn(row, FIELD_LABELS[key]));
    const num = (key: keyof Product) => toNumber(cellIn(row, FIELD_LABELS[key]));

    const rawQty = num('stockQty');
    const qtyValid = rawQty !== null && Number.isInteger(rawQty) && rawQty >= 0;

    const product: Product = {
      productName: text('productName'),
      brand: text('brand'),
      category: text('category'),
      subCategory: text('subCategory'),
      sku: text('sku'),
      size: text('size'),
      color: text('color'),
      unitOfMeasure: text('unitOfMeasure'),
      packing: text('packing'),
      stockQty: qtyValid ? rawQty : null,
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

    const id = ids[i];
    const issues: ProductIssue[] = [];
    if (id === '') {
      issues.push('missing-id');
    } else if ((idCounts.get(id) ?? 0) > 1) {
      issues.push('duplicate-id');
    }
    if (!qtyValid) {
      issues.push('invalid-quantity');
    }

    return { ref: createRowRef(sheet.key, id), product, issues };
  });
}

function isBlankRow(row: readonly CellValue[]): boolean {
  return row.every((cell) => toText(cell).trim() === '');
}

/** Text fields: a number (e.g. a numeric SKU or packing) becomes its text form; missing -> ''. */
function toText(cell: CellValue | undefined): string {
  return cell === undefined ? '' : typeof cell === 'string' ? cell : String(cell);
}

/** Number fields: numbers kept, numeric text converted; blank or non-numeric -> null (never 0). */
function toNumber(cell: CellValue | undefined): number | null {
  if (typeof cell === 'number') {
    return Number.isFinite(cell) ? cell : null;
  }
  if (typeof cell !== 'string' || cell.trim() === '') {
    return null;
  }
  const n = Number(cell.trim());
  return Number.isFinite(n) ? n : null;
}
