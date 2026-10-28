const MS_PER_DAY = 86_400_000;
/** Days from Google Sheets' epoch (1899-12-30) to the Unix epoch (1970-01-01). */
const SHEETS_EPOCH_OFFSET_DAYS = 25_569;

/**
 * Last Updated as a Google Sheets date serial (days since 1899-12-30) taken
 * from the user's LOCAL wall-clock time, to the second. Written RAW, it is a
 * real date, and the column's `dd/MM/yyyy HH:mm:ss` format shows it (all staff
 * are in one time zone, IST — DECISIONS 2026-10-27).
 */
export function toSheetSerial(date: Date): number {
  const localMs = date.getTime() - date.getTimezoneOffset() * 60_000;
  const wholeSeconds = Math.round(localMs / 1000) * 1000;
  return wholeSeconds / MS_PER_DAY + SHEETS_EPOCH_OFFSET_DAYS;
}

/** The same moment as the app displays Last Updated: `dd/MM/yyyy HH:mm:ss`. */
export function formatSheetTimestamp(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return (
    `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`
  );
}
