/**
 * URL path segment for a whole-tab A1 range in the Sheets API
 * (`/values/{range}`). The tab name is single-quoted with inner apostrophes
 * doubled, so names with spaces or apostrophes resolve to the right tab. The
 * result is fully percent-encoded (`encodeURIComponent` leaves `'` as is).
 */
export function tabRange(tab: string): string {
  return encodeURIComponent(quotedTab(tab)).replaceAll("'", '%27');
}

/** A1 column letters for a 0-based column index: 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`Column index must be a whole number ≥ 0, got ${index}`);
  }
  let letters = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

/**
 * One exact cell as an A1 range for a request body (not URL-encoded), e.g.
 * `'Sheet1'!K12`. `row` is the sheet's 1-based row number. The writer only
 * ever addresses single cells like this (AI_CONTRACT: Writes).
 */
export function cellRange(tab: string, columnIndex: number, row: number): string {
  if (!Number.isInteger(row) || row < 1) {
    throw new RangeError(`Row must be a whole number ≥ 1, got ${row}`);
  }
  return `${quotedTab(tab)}!${columnLetter(columnIndex)}${row}`;
}

function quotedTab(tab: string): string {
  return `'${tab.replaceAll("'", "''")}'`;
}
