import { LogRow } from '@core/sheets/stock-log-map';
import { toSheetSerial } from '@core/sheets/sheet-timestamp';

/** How the quantity changed (CR-05). */
export type LogMode = 'Add' | 'Subtract' | 'New total' | 'Form edit' | 'Undo' | 'New product';

/** One confirmed Master stock change, as the log records it. Master quantities only. */
export interface LogChange {
  readonly mode: LogMode;
  readonly sku: string;
  /** Master quantity before; null for a new product. */
  readonly before: number | null;
  /** Master quantity after (confirmed). */
  readonly after: number;
  /** The signed-in first name; null when unknown. Never an email or token. */
  readonly user: string | null;
  /** For Undo: the Change ID of the change it reverses. */
  readonly reverses?: string;
}

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomSuffix(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('');
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** `yyyyMMdd-HHmmss-XXXX` in the user's local time: sorts by time, unique in practice. */
export function changeId(now: Date, suffix: string = randomSuffix()): string {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}-${time}-${suffix}`;
}

/**
 * THE ONE place a Stock Log line is built (US-94). Pure apart from the random
 * suffix (pass `suffix` in tests). Change is a number: after − before (the
 * opening stock for a new product). Logged At is a date serial; the writer
 * gives its cell the date-time format.
 */
export function logLine(change: LogChange, now: Date, suffix?: string): LogRow {
  return {
    changeId: changeId(now, suffix),
    loggedAt: toSheetSerial(now),
    user: change.user ?? 'Signed in',
    sku: change.sku,
    mode: change.mode,
    qtyBefore: change.before ?? '',
    change: change.after - (change.before ?? 0),
    qtyAfter: change.after,
    note: change.reverses === undefined ? '' : `Reverses ${change.reverses}`,
  };
}
