import { CellValue } from './data-mapping';

/**
 * The Stock Log's nine columns (CR-05, US-94), found by header LABEL (trimmed,
 * case-insensitive, any order) like the product sheets. The app only appends
 * rows in this shape; it never edits or deletes a line.
 */
export const LOG_LABELS = {
  changeId: 'Change ID',
  loggedAt: 'Logged At',
  user: 'User',
  sku: 'SKU',
  mode: 'Mode',
  qtyBefore: 'Qty Before',
  change: 'Change',
  qtyAfter: 'Qty After',
  note: 'Note',
} as const;

export type LogField = keyof typeof LOG_LABELS;

/** One log line's values by field; `''` is an empty cell. */
export type LogRow = Readonly<Record<LogField, CellValue>>;

export type LogHeaders =
  | { readonly ok: true; readonly columns: ReadonlyMap<LogField, number>; readonly width: number }
  | { readonly ok: false; readonly missing: readonly string[] };

/** A log header row whose nine columns were all found. */
export type ResolvedLogHeaders = Extract<LogHeaders, { ok: true }>;

const normalise = (value: CellValue | undefined): string =>
  String(value ?? '')
    .trim()
    .toLowerCase();

/** Pure: finds the nine columns in a header row, or names the missing ones. */
export function resolveLogHeaders(header: readonly CellValue[]): LogHeaders {
  const index = new Map(header.map((cell, i) => [normalise(cell), i] as const));
  const columns = new Map<LogField, number>();
  const missing: string[] = [];
  for (const [field, label] of Object.entries(LOG_LABELS) as [LogField, string][]) {
    const at = index.get(label.toLowerCase());
    if (at === undefined) {
      missing.push(label);
    } else {
      columns.set(field, at);
    }
  }
  return missing.length > 0 ? { ok: false, missing } : { ok: true, columns, width: header.length };
}

/** Pure: the row to append, in the sheet's own column order; columns the log does not know stay blank. */
export function logRowCells(
  columns: ReadonlyMap<LogField, number>,
  width: number,
  line: LogRow,
): CellValue[] {
  const cells: CellValue[] = Array.from({ length: width }, () => '');
  for (const [field, at] of columns) {
    cells[at] = line[field];
  }
  return cells;
}
