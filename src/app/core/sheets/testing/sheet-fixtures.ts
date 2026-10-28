import { SheetDefinition } from '@core/config/app-environment';
import { CellValue } from '../data-mapping';

/** Test-only fixtures (imported by spec files). Fake IDs: never real spreadsheet IDs. */
export const MASTER_SHEET: SheetDefinition = {
  key: 'master',
  label: 'Master',
  spreadsheetId: 'fake-master-id',
  tab: 'Sheet1',
};

export const DR_TRUST_SHEET: SheetDefinition = {
  key: 'dr-trust',
  label: 'Dr Trust',
  spreadsheetId: 'fake-dr-trust-id',
  tab: 'Sheet1',
};

/** The 21 required headers, in the sheet's usual order. */
export const HEADER: readonly string[] = [
  'id',
  'brand',
  'product name',
  'category',
  'sub category',
  'sku',
  'size',
  'color',
  'unit of measure',
  'packing',
  'stock qty',
  'low stock threshold',
  'stock status',
  'mrp',
  'selling price',
  'purchase price',
  'tax rate',
  'status',
  'notes',
  'last updated',
  'created at',
];

const DEFAULTS: Readonly<Record<string, CellValue>> = {
  id: 'row-1',
  brand: 'Dr Trust',
  'product name': 'BP Monitor',
  category: 'Health',
  'sub category': 'Monitors',
  sku: 'DT-BP-01',
  size: 'M',
  color: 'White',
  'unit of measure': 'pcs',
  packing: 'Box',
  'stock qty': 10,
  'low stock threshold': 5,
  'stock status': 'In Stock',
  mrp: 2999,
  'selling price': 2499,
  'purchase price': 1800,
  'tax rate': 18,
  status: 'Active',
  notes: '',
  'last updated': '28/10/2026 10:00:00',
  'created at': '01/01/2026',
};

/** One data row in HEADER order; `overrides` are keyed by header label. */
export function sheetRow(overrides: Readonly<Record<string, CellValue>> = {}): CellValue[] {
  return HEADER.map((label) => overrides[label] ?? DEFAULTS[label]);
}

/** A whole tab: header row followed by `rows`. */
export function sheetValues(...rows: CellValue[][]): CellValue[][] {
  return [[...HEADER], ...rows];
}
