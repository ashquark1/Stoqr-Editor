/** Literal shown for values that are missing/blank. */
export const EMPTY_DISPLAY = 'empty';

/**
 * Presentation helper: render a value for the table/modal.
 *
 * - `null` / `undefined` (missing numerics) -> "empty"
 * - empty or whitespace-only string -> "empty"
 * - genuine placeholders like "-" -> kept verbatim (real data)
 * - numbers (including 0) -> their string form
 *
 * The data layer stays faithful (null vs ""); this only affects display.
 */
export function displayValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return EMPTY_DISPLAY;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return value.trim() === '' ? EMPTY_DISPLAY : value;
}
