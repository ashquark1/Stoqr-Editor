import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Auth, SessionEndedError } from '@core/auth/auth';
import { AppConfig } from '@core/config/app-config';
import { SheetDefinition } from '@core/config/app-environment';
import { LoadedProduct, Product } from '@core/models/product';
import { ApprovedChange, InvalidChangeError, RowChange } from './approval';
import { RETRY_DELAYS_MS, RETRY_WAIT, isBusy, retryDelay } from './backoff';
import { CellValue } from './data-mapping';
import { RowRef, rowRefId } from './row-ref';
import { SheetLoadError } from './sheet-load-error';
import { SHEETS_API, SheetsReader } from './sheets-reader';
import { CellWrite, WritePlan, planRowWrite } from './write-plan';

export type WriteFailureKind =
  | 'not-approved'
  | 'invalid'
  | 'columns'
  | 'row-missing'
  | 'row-duplicated'
  | 'access'
  | 'not-found'
  | 'expired'
  | 'unavailable'
  | 'unconfirmed';

/** A write that did not happen (or could not be confirmed), naming the sheet; safe to show staff. */
export class SheetWriteError extends Error {
  constructor(
    readonly sheetLabel: string,
    readonly kind: WriteFailureKind,
    message: string,
  ) {
    super(message);
    this.name = 'SheetWriteError';
  }
}

/** One sheet's confirmed write. `ref` is the approved row's ref (unchanged). */
export interface SheetWritten {
  readonly sheet: SheetDefinition;
  readonly ref: RowRef;
  readonly product: Product;
  readonly cells: readonly CellWrite[];
}

export type WriteResult =
  /** Every sheet written and confirmed. */
  | { readonly kind: 'written'; readonly sheets: readonly SheetWritten[] }
  /** Nothing written: a reviewed value changed underneath. */
  | {
      readonly kind: 'conflict';
      readonly sheet: SheetDefinition;
      readonly ref: RowRef;
      readonly current: LoadedProduct;
      readonly fields: readonly (keyof Product)[];
    }
  /** Nothing written. */
  | { readonly kind: 'failed'; readonly error: SheetWriteError }
  /**
   * Some sheets written and confirmed; the rest not (never success).
   * `remaining` is the approval for the unwritten rows, for Retry (US-34).
   */
  | {
      readonly kind: 'partial';
      readonly written: readonly SheetWritten[];
      readonly error: SheetWriteError;
      readonly remaining: ApprovedChange;
    };

/**
 * Exactly how values go to Google (US-10). RAW: text is stored as text, so no
 * formula can ever be written (confirmed for now; revisit — DECISIONS). The
 * written values come back so success is shown only once confirmed.
 */
export const WRITE_OPTIONS = {
  valueInputOption: 'RAW',
  includeValuesInResponse: true,
  responseValueRenderOption: 'UNFORMATTED_VALUE',
  responseDateTimeRenderOption: 'SERIAL_NUMBER',
} as const;

/**
 * The ONLY formatting the app writes (US-19 fix): Last Updated holds a date
 * serial, which shows as `dd/MM/yyyy HH:mm:ss` only with this number format
 * (Sheets pattern syntax; `mm` after `hh` is minutes). Set on the one stamped
 * cell, number format only — fonts, colours and borders are untouched.
 */
export const LAST_UPDATED_FORMAT = { type: 'DATE_TIME', pattern: 'dd/mm/yyyy hh:mm:ss' } as const;
export const FORMAT_FIELDS = 'userEnteredFormat.numberFormat';

/** The part of a `values:batchUpdate` response the writer checks. */
interface BatchUpdateResponse {
  readonly responses?: readonly { readonly updatedData?: { readonly values?: CellValue[][] } }[];
}

interface Target {
  readonly row: RowChange;
  readonly sheet: SheetDefinition;
  readonly id: string;
}

type Ready = Extract<WritePlan, { kind: 'ready' }>;
/** A sheet re-read and planned, with its tab's internal number for the format request. */
interface Planned {
  readonly plan: Ready;
  readonly tabId: number;
}
/** Per sheet, across its format and value requests: one renewal, `RETRY_DELAYS_MS.length` busy resends. */
interface Budget {
  readonly mayRenew: boolean;
  readonly busyRetries: number;
}
const FULL_BUDGET: Budget = { mayRenew: true, busyRetries: 0 };

type Failure = { readonly ok: false; readonly result: WriteResult };
type Checked = { readonly ok: true; readonly planned: Planned } | Failure;
type Formatted = { readonly ok: true; readonly planned: Planned; readonly budget: Budget } | Failure;
type Sent = { readonly ok: true; readonly written: SheetWritten } | Failure;
/** After a failed request: resend (re-checked first) or give up. */
type Recovery = { readonly ok: true; readonly planned: Planned; readonly budget: Budget } | Failure;

/**
 * THE ONLY code that changes a spreadsheet (AI_CONTRACT: Writes). Parameterised
 * by sheet definition; one row, or one row per sheet for a linked product. It
 * takes only a genuine `ApprovedChange`, then:
 * 1. checks EVERY sheet first — re-reads it, finds the row by `id`, re-checks
 *    the reviewed values, looks up the tab's number — and writes nothing if
 *    any check fails;
 * 2. gives every sheet's Last Updated cell its date-time format, in order,
 *    before any value is written. This needs Editor rights but changes no
 *    data, so a sheet the user cannot edit stops the change with nothing
 *    written, rather than half-way (US-19 fix);
 * 3. writes the sheets in order (Master, then Dr Trust), exact single cells in
 *    one request each, with Stock Status and Last Updated filled in;
 * 4. reports `written` only when Google returns every value it was sent, and
 *    `partial` (never success) when a later sheet fails after an earlier one.
 * A request is retried automatically ONLY after 429 (Google saved nothing), and
 * only after re-reading and re-checking that sheet (US-11, owner choice). A
 * 5xx or network failure on a value write may have saved, so it is reported,
 * never resent.
 */
@Injectable({ providedIn: 'root' })
export class SheetsWriter {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly reader = inject(SheetsReader);
  private readonly config = inject(AppConfig);
  private readonly wait = inject(RETRY_WAIT);

  async write(approved: ApprovedChange): Promise<WriteResult> {
    if (!ApprovedChange.isGenuine(approved)) {
      return failed('', 'not-approved', 'This change was not approved, so nothing was written.');
    }
    const targets: Target[] = [];
    for (const row of approved.rows) {
      const sheet = this.config.sheet(row.target.sheet);
      const id = rowRefId(row.target);
      if (id === undefined || id === '') {
        return failed(sheet.label, 'row-missing', `This product has no id in ${sheet.label}, so nothing was written.`);
      }
      targets.push({ row, sheet, id });
    }

    // 1. Check every sheet before writing any (owner choice: "check both first").
    const checks = await Promise.all(targets.map((t) => this.check(t)));
    const planned: Planned[] = [];
    for (const check of checks) {
      if (!check.ok) {
        return check.result;
      }
      planned.push(check.planned);
    }

    // 2. Format every sheet's Last Updated cell before writing any value.
    const budgets: Budget[] = [];
    for (const [i, target] of targets.entries()) {
      const formatted = await this.format(target, planned[i], FULL_BUDGET);
      if (!formatted.ok) {
        return formatted.result;
      }
      planned[i] = formatted.planned;
      budgets.push(formatted.budget);
    }

    // 3. Write in order; stop at the first failure.
    const written: SheetWritten[] = [];
    for (const [i, target] of targets.entries()) {
      const sent = await this.send(target, planned[i], budgets[i]);
      if (!sent.ok) {
        if (written.length === 0) {
          return sent.result;
        }
        // An earlier sheet is already written: whatever stopped this one, it is partial.
        const error =
          sent.result.kind === 'failed'
            ? sent.result.error
            : new SheetWriteError(target.sheet.label, 'invalid', `${target.sheet.label} changed while saving.`);
        const remaining = approved.remaining(written.map((s) => s.sheet.key));
        return { kind: 'partial', written, error, remaining };
      }
      written.push(sent.written);
    }
    return { kind: 'written', sheets: written };
  }

  /** Re-read one sheet (values and tab number) and plan its write against the fresh data. */
  private async check(target: Target): Promise<Checked> {
    const { sheet, row, id } = target;
    let values;
    let tabId: number;
    try {
      [values, tabId] = await Promise.all([this.reader.read(sheet), this.reader.tabId(sheet)]);
    } catch (error) {
      return { ok: false, result: { kind: 'failed', error: fromLoadError(sheet, error) } };
    }
    let plan: WritePlan;
    try {
      plan = planRowWrite(sheet, values, id, row, new Date());
    } catch (error) {
      if (error instanceof SheetLoadError) {
        return { ok: false, result: { kind: 'failed', error: fromLoadError(sheet, error) } };
      }
      if (error instanceof InvalidChangeError || error instanceof RangeError) {
        return { ok: false, result: failed(sheet.label, 'invalid', error.message) };
      }
      throw error;
    }
    switch (plan.kind) {
      case 'ready':
        return { ok: true, planned: { plan, tabId } };
      case 'conflict':
        return {
          ok: false,
          result: { kind: 'conflict', sheet, ref: row.target, current: plan.current, fields: plan.fields },
        };
      case 'row-missing':
        return {
          ok: false,
          result: failed(sheet.label, 'row-missing', `This product is no longer in ${sheet.label}. Nothing was written.`),
        };
      case 'row-duplicated':
        return {
          ok: false,
          result: failed(
            sheet.label,
            'row-duplicated',
            `This product's id now appears twice in ${sheet.label}. Nothing was written.`,
          ),
        };
    }
  }

  /**
   * Sets the date-time format on the plan's Last Updated cell: one
   * `repeatCell` on that one cell, number format only. No value is sent, so
   * any failure here means nothing was saved to this sheet.
   */
  private async format(target: Target, planned: Planned, budget: Budget): Promise<Formatted> {
    const { sheet } = target;
    const { rowIndex, columnIndex } = planned.plan.stampCell;
    try {
      const token = await this.auth.freshToken();
      await firstValueFrom(
        this.http.post(
          `${SHEETS_API}/${encodeURIComponent(sheet.spreadsheetId)}:batchUpdate`,
          {
            requests: [
              {
                repeatCell: {
                  range: {
                    sheetId: planned.tabId,
                    startRowIndex: rowIndex,
                    endRowIndex: rowIndex + 1,
                    startColumnIndex: columnIndex,
                    endColumnIndex: columnIndex + 1,
                  },
                  cell: { userEnteredFormat: { numberFormat: LAST_UPDATED_FORMAT } },
                  fields: FORMAT_FIELDS,
                },
              },
            ],
          },
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
    } catch (error) {
      const next = await this.recover(target, error, budget, false);
      return next.ok ? this.format(target, next.planned, next.budget) : next;
    }
    return { ok: true, planned, budget };
  }

  /** One request with exact cells; confirmed against Google's echo. */
  private async send(target: Target, planned: Planned, budget: Budget): Promise<Sent> {
    const { sheet } = target;
    const { plan } = planned;
    let response: BatchUpdateResponse;
    try {
      const token = await this.auth.freshToken();
      response = await firstValueFrom(
        this.http.post<BatchUpdateResponse>(
          `${SHEETS_API}/${encodeURIComponent(sheet.spreadsheetId)}/values:batchUpdate`,
          {
            ...WRITE_OPTIONS,
            data: plan.writes.map((w) => ({ range: w.range, majorDimension: 'ROWS', values: [[w.value]] })),
          },
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
    } catch (error) {
      const next = await this.recover(target, error, budget, true);
      if (!next.ok) {
        return next;
      }
      // Re-checked: the row may have moved, so format its Last Updated cell again first.
      const formatted = await this.format(target, next.planned, next.budget);
      return formatted.ok ? this.send(target, formatted.planned, formatted.budget) : formatted;
    }

    const returned = response.responses ?? [];
    const confirmed =
      returned.length === plan.writes.length &&
      plan.writes.every((w, i) => sameCell(returned[i]?.updatedData?.values?.[0]?.[0] ?? '', w.value));
    if (!confirmed) {
      return {
        ok: false,
        result: failed(
          sheet.label,
          'unconfirmed',
          `Google did not confirm the change in ${sheet.label}. Reload to check it before trying again.`,
        ),
      };
    }
    return { ok: true, written: { sheet, ref: target.row.target, product: plan.expected, cells: plan.writes } };
  }

  /**
   * After a failed format or value request: a 401 renews once and a 429 waits
   * (up to the budget), each re-reading and re-checking THIS sheet only (an
   * earlier sheet may already be written). Anything else gives up.
   * `valuesSent`: whether the failed request carried values (which a 5xx or
   * network failure may have saved).
   */
  private async recover(target: Target, error: unknown, budget: Budget, valuesSent: boolean): Promise<Recovery> {
    const { sheet } = target;
    if (error instanceof SessionEndedError) {
      return { ok: false, result: failed(sheet.label, 'expired', `You signed out before ${sheet.label} was saved.`) };
    }
    let next: Budget;
    if (error instanceof HttpErrorResponse && error.status === 401) {
      this.auth.markExpired();
      if (!budget.mayRenew) {
        return {
          ok: false,
          result: failed(sheet.label, 'expired', `Your session expired before ${sheet.label} was saved.`),
        };
      }
      next = { ...budget, mayRenew: false };
    } else if (isBusy(error) && budget.busyRetries < RETRY_DELAYS_MS.length) {
      // Google saved nothing: wait, then re-read and re-check before resending.
      await this.wait(retryDelay(budget.busyRetries, error));
      next = { ...budget, busyRetries: budget.busyRetries + 1 };
    } else {
      return { ok: false, result: { kind: 'failed', error: fromWriteError(sheet, error, valuesSent) } };
    }
    const again = await this.check(target);
    return again.ok ? { ok: true, planned: again.planned, budget: next } : again;
  }
}

/** Text must match exactly; numbers within a hair (a date serial may round in transit). */
function sameCell(returned: CellValue, sent: CellValue): boolean {
  if (typeof returned === 'number' && typeof sent === 'number') {
    return Math.abs(returned - sent) < 1e-9;
  }
  return returned === sent;
}

function failed(sheetLabel: string, kind: WriteFailureKind, message: string): WriteResult {
  return { kind: 'failed', error: new SheetWriteError(sheetLabel, kind, message) };
}

function fromLoadError(sheet: SheetDefinition, error: unknown): SheetWriteError {
  if (error instanceof SheetLoadError) {
    const kind: WriteFailureKind =
      error.kind === 'tab' ? 'not-found' : error.kind === 'columns' ? 'columns' : error.kind;
    return new SheetWriteError(sheet.label, kind, `${error.message} Nothing was written.`);
  }
  return new SheetWriteError(sheet.label, 'unavailable', `Couldn't reach ${sheet.label}. Nothing was written.`);
}

function fromWriteError(sheet: SheetDefinition, error: unknown, valuesSent: boolean): SheetWriteError {
  const status = error instanceof HttpErrorResponse ? error.status : 0;
  if (status === 403) {
    return new SheetWriteError(
      sheet.label,
      'access',
      `You don't have edit access to ${sheet.label}. Ask the owner to share it with you as Editor.`,
    );
  }
  if (status === 404) {
    return new SheetWriteError(sheet.label, 'not-found', `${sheet.label} spreadsheet not found, check configuration.`);
  }
  if (status === 429) {
    return new SheetWriteError(
      sheet.label,
      'unavailable',
      `Google is busy right now (too many requests). Nothing was saved to ${sheet.label}. Wait a minute and try again.`,
    );
  }
  if ((status === 0 || status >= 500) && !valuesSent) {
    // Only the format request failed: no value was sent.
    return new SheetWriteError(
      sheet.label,
      'unavailable',
      `Couldn't save to ${sheet.label}. Nothing was saved. Check your connection and try again.`,
    );
  }
  if (status === 0 || status >= 500) {
    // The request may have reached Google and been saved: never claim it was not.
    return new SheetWriteError(
      sheet.label,
      'unconfirmed',
      `Google didn't confirm the save to ${sheet.label}, so it may or may not have been saved. Try again re-checks the sheet first.`,
    );
  }
  return new SheetWriteError(sheet.label, 'unavailable', `Couldn't save to ${sheet.label}. Check your connection and try again.`);
}
