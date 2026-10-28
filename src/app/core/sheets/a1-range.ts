/**
 * URL path segment for a whole-tab A1 range in the Sheets API
 * (`/values/{range}`). The tab name is single-quoted with inner apostrophes
 * doubled, so names with spaces or apostrophes resolve to the right tab. The
 * result is fully percent-encoded (`encodeURIComponent` leaves `'` as is).
 */
export function tabRange(tab: string): string {
  return encodeURIComponent(`'${tab.replaceAll("'", "''")}'`).replaceAll("'", '%27');
}
