import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Auth, SessionEndedError } from '@core/auth/auth';
import { AppConfig } from '@core/config/app-config';
import { SheetDefinition, SheetKey, SheetLocation } from '@core/config/app-environment';
import { LoadedProduct, Product } from '@core/models/product';
import { ApprovedChange, ApprovedCreate, InvalidChangeError, RowChange } from './approval';
import { CreatePlan, isSameProduct, planCreate, rowsWithSku } from './create-plan';
import { RETRY_DELAYS_MS, RETRY_WAIT, isBusy, retryDelay } from './backoff';
import { CellValue } from './data-mapping';
import { RowRef, createRowRef, rowRefId } from './row-ref';
import { SheetLoadError } from './sheet-load-error';
import { LogRow, logRowCells, resolveLogHeaders } from './stock-log-map';
import { tabRange } from './a1-range';
import { SHEETS_API, SheetsReader } from './sheets-reader';
import { freshSkuHolder } from './sku-check';
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
  | 'unconfirmed'
  | 'sku-taken';

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
 * One Stock Log append (CR-05, US-94): `logged` only when Google echoes every
 * value. `unconfirmed` (5xx / network) may have been written, so it is never
 * resent automatically; `failed` wrote nothing.
 */
export type LogAppendResult =
  | { readonly kind: 'logged'; readonly changeId: string }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'unconfirmed'; readonly message: string };

/** One sheet's confirmed new product row (US-97); `ref` is made here, so the id stays in `core/sheets/`. */
export interface CreatedRow {
  readonly sheet: SheetDefinition;
  readonly ref: RowRef;
  readonly product: Product;
}

export type CreateResult =
  /** Every target sheet has the product (added now, or by an earlier attempt of this approval). */
  | { readonly kind: 'written'; readonly sheets: readonly CreatedRow[] }
  /** Nothing added: the SKU is already on a row. */
  | { readonly kind: 'conflict'; readonly sheet: SheetDefinition; readonly message: string }
  /** Nothing added (or, `unconfirmed`, maybe added). */
  | { readonly kind: 'failed'; readonly error: SheetWriteError }
  /** Master has it, Dr Trust not; `remaining` appends only Dr Trust (Retry). */
  | {
      readonly kind: 'partial';
      readonly written: readonly CreatedRow[];
      readonly error: SheetWriteError;
      readonly remaining: ApprovedCreate;
    };

/** The part of a `values:append` response the writer checks. */
interface AppendResponse {
  readonly updates?: {
    readonly updatedRange?: string;
    readonly updatedData?: { readonly values?: CellValue[][] };
  };
}

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
  /** The tab as re-read for this plan (for the SKU re-check). */
  readonly values: CellValue[][] | undefined;
}
/** Per sheet, across its format and value requests: one renewal, `RETRY_DELAYS_MS.length` busy resends. */
interface Budget {
  readonly mayRenew: boolean;
  readonly busyRetries: number;
}
const FULL_BUDGET: Budget = { mayRenew: true, busyRetries: 0 };

/** A new SKU is checked against both sheets, whichever rows the approval covers. */
const SKU_SHEETS: readonly SheetKey[] = ['master', 'dr-trust'];

type Failure = { readonly ok: false; readonly result: WriteResult };
type Checked = { readonly ok: true; readonly planned: Planned } | Failure;
type Formatted =
  | { readonly ok: true; readonly planned: Planned; readonly budget: Budget }
  | Failure;
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
  /** New-product approvals whose append was sent at least once (US-97: never added twice). */
  private readonly sentCreates = new WeakSet<ApprovedCreate>();

  /**
   * Appends ONE Stock Log line (CR-05, US-94) — the only kind of row the log
   * ever gets; it never edits or deletes a line. Called only right after a
   * confirmed Master stock write (the AI_CONTRACT named exception) or by Retry
   * log. Re-reads the header row (columns by label), appends at the bottom
   * (`values:append`, RAW, insert rows), confirms against Google's echo, then
   * gives the Logged At cell the date-time format (a format failure keeps the
   * confirmed line). 429 → backoff and resend (Google saved nothing); 401 →
   * renewal, once more; 5xx / network → `unconfirmed`, never resent.
   */
  async appendLogLine(line: LogRow): Promise<LogAppendResult> {
    const log = this.config.stockLog();
    if (log === null) {
      return { kind: 'failed', message: 'The Stock Log sheet is not set up.' };
    }
    let header;
    try {
      header = resolveLogHeaders(await this.reader.readHeader(log));
    } catch (error) {
      return {
        kind: 'failed',
        message: error instanceof Error ? error.message : `Couldn't read ${log.label}.`,
      };
    }
    if (!header.ok) {
      return {
        kind: 'failed',
        message: `The ${log.label} sheet is missing the column ${header.missing.join(', ')}.`,
      };
    }
    const cells = logRowCells(header.columns, header.width, line);
    const url = `${SHEETS_API}/${encodeURIComponent(log.spreadsheetId)}/values/${tabRange(log.tab)}:append`;

    let response: AppendResponse | null = null;
    let renewed = false;
    for (let attempt = 0; response === null; ) {
      try {
        const token = await this.auth.freshToken();
        response = await firstValueFrom(
          this.http.post<AppendResponse>(
            url,
            { values: [cells] },
            {
              headers: { Authorization: `Bearer ${token}` },
              params: { ...WRITE_OPTIONS, insertDataOption: 'INSERT_ROWS' },
            },
          ),
        );
      } catch (error) {
        if (error instanceof SessionEndedError) {
          return { kind: 'failed', message: 'Your session ended before the change was logged.' };
        }
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        if (status === 401 && !renewed) {
          renewed = true;
          this.auth.markExpired();
          continue;
        }
        if (isBusy(error) && attempt < RETRY_DELAYS_MS.length) {
          await this.wait(retryDelay(attempt, error));
          attempt++;
          continue;
        }
        if (status === 403) {
          return {
            kind: 'failed',
            message: `You don't have edit access to the ${log.label} sheet.`,
          };
        }
        if (status === 404 || status === 400) {
          return {
            kind: 'failed',
            message: `The ${log.label} sheet or its ${log.tab} tab was not found.`,
          };
        }
        if (isBusy(error)) {
          return {
            kind: 'failed',
            message: `Google is busy right now (too many requests). Nothing was logged.`,
          };
        }
        // 5xx or network: Google may have added the line, so it is never resent automatically.
        return {
          kind: 'unconfirmed',
          message: `Google didn't confirm the ${log.label} line, so it may or may not have been added.`,
        };
      }
    }

    const echoed = response.updates?.updatedData?.values?.[0] ?? [];
    const confirmed = cells.every((cell, i) => sameLogCell(cell, echoed[i]));
    if (!confirmed) {
      return {
        kind: 'unconfirmed',
        message: `Google didn't confirm the ${log.label} line, so it may or may not have been added.`,
      };
    }
    const loggedAt = header.columns.get('loggedAt');
    const row = appendedRow(response.updates?.updatedRange);
    if (loggedAt !== undefined && row !== null) {
      await this.formatDateCells(log, row - 1, [loggedAt]);
    }
    return { kind: 'logged', changeId: String(line.changeId) };
  }

  /**
   * The date-time format on an APPENDED row's date cells (the log's Logged At;
   * a new product's Created At and Last Updated), one `repeatCell` per cell,
   * number format only. Best effort: the confirmed row stays either way, and
   * the dates show as numbers until formatted by hand.
   */
  private async formatDateCells(
    location: SheetLocation,
    rowIndex: number,
    columns: readonly number[],
  ): Promise<void> {
    try {
      const tabId = await this.reader.tabId(location);
      const token = await this.auth.freshToken();
      await firstValueFrom(
        this.http.post(
          `${SHEETS_API}/${encodeURIComponent(location.spreadsheetId)}:batchUpdate`,
          {
            requests: columns.map((columnIndex) => ({
              repeatCell: {
                range: {
                  sheetId: tabId,
                  startRowIndex: rowIndex,
                  endRowIndex: rowIndex + 1,
                  startColumnIndex: columnIndex,
                  endColumnIndex: columnIndex + 1,
                },
                cell: { userEnteredFormat: { numberFormat: LAST_UPDATED_FORMAT } },
                fields: FORMAT_FIELDS,
              },
            })),
          },
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
    } catch {
      // Confirmed already; only the look of the date cells is missing.
    }
  }

  /**
   * Adds a NEW product (CR-05, US-97) — the only code that appends a product
   * row; it never deletes one. Takes only a genuine `ApprovedCreate`, then:
   * 1. re-reads BOTH sheets (the SKU must be new to both) and writes nothing
   *    if the SKU is on any row (`conflict`) or a sheet can't be read;
   * 2. appends Master, then Dr Trust (Dr Trust brand only), one
   *    `values:append` each (RAW, insert rows), the row built by header with
   *    id = highest numeric id + 1, derived Stock Status, and Created At /
   *    Last Updated as date serials; confirmed only by Google's echo, then the
   *    date cells get their format;
   * 3. reports `written`, or `partial` (Master added, Dr Trust not) with
   *    `remaining` for Retry. Once an append of this approval has been sent,
   *    a row with the same SKU and product name counts as already added, so
   *    Retry / Try again never adds a product twice.
   * 429 → re-read, re-check, resend; 401 → renewal, once more; 5xx / network
   * → `unconfirmed`, never resent automatically.
   */
  async create(approved: ApprovedCreate): Promise<CreateResult> {
    if (!ApprovedCreate.isGenuine(approved)) {
      return { kind: 'failed', error: new SheetWriteError('', 'not-approved', 'This product was not approved, so nothing was added.') };
    }
    const resumed = this.sentCreates.has(approved.origin);

    // 1. Both sheets fresh: the SKU must be on no row of either (else nothing is added).
    const fresh = new Map<SheetKey, CellValue[][] | undefined>();
    for (const key of SKU_SHEETS) {
      const sheet = this.config.sheet(key);
      try {
        fresh.set(key, await this.reader.read(sheet));
      } catch (error) {
        return { kind: 'failed', error: fromLoadError(sheet, error) };
      }
    }
    const done: CreatedRow[] = [];
    const toAdd: SheetDefinition[] = [];
    for (const key of SKU_SHEETS) {
      const sheet = this.config.sheet(key);
      const check = this.checkNewRow(sheet, fresh.get(key), approved, resumed);
      if (check.kind === 'taken') {
        return { kind: 'conflict', sheet, message: check.message };
      }
      if (check.kind === 'failed') {
        return { kind: 'failed', error: check.error };
      }
      if (check.kind === 'already') {
        done.push(check.row);
      } else if (check.kind === 'add') {
        toAdd.push(sheet);
      }
    }

    // 2. Append in order (Master first); stop at the first failure.
    for (const sheet of toAdd) {
      this.sentCreates.add(approved.origin);
      const added = await this.appendRow(sheet, approved, fresh.get(sheet.key));
      if (!added.ok) {
        if (done.length === 0) {
          return { kind: 'failed', error: added.error };
        }
        return {
          kind: 'partial',
          written: done,
          error: added.error,
          remaining: approved.remaining(done.map((row) => row.sheet.key)),
        };
      }
      done.push(added.row);
    }
    return { kind: 'written', sheets: done };
  }

  /** One sheet's SKU check for a new product, on a freshly read tab. */
  private checkNewRow(
    sheet: SheetDefinition,
    values: CellValue[][] | undefined,
    approved: ApprovedCreate,
    resumed: boolean,
  ):
    | { readonly kind: 'add' | 'skip' }
    | { readonly kind: 'already'; readonly row: CreatedRow }
    | { readonly kind: 'taken'; readonly message: string }
    | { readonly kind: 'failed'; readonly error: SheetWriteError } {
    let holders: LoadedProduct[];
    try {
      holders = rowsWithSku(sheet, values, approved.values.sku);
    } catch (error) {
      return { kind: 'failed', error: fromLoadError(sheet, error) };
    }
    const target = approved.sheets.includes(sheet.key);
    if (holders.length === 0) {
      return { kind: target ? 'add' : 'skip' };
    }
    const [first] = holders;
    if (target && resumed && holders.length === 1 && isSameProduct(first, approved.values)) {
      return { kind: 'already', row: { sheet, ref: first.ref, product: first.product } };
    }
    return {
      kind: 'taken',
      message: `SKU ${approved.values.sku} is already used in ${sheet.label} (${first.product.productName || 'no name'}). Nothing was saved.`,
    };
  }

  /** Appends one new product row; 401 renews once and 429 waits, each re-reading and re-checking this sheet. */
  private async appendRow(
    sheet: SheetDefinition,
    approved: ApprovedCreate,
    values: CellValue[][] | undefined,
  ): Promise<{ readonly ok: true; readonly row: CreatedRow } | { readonly ok: false; readonly error: SheetWriteError }> {
    const url = `${SHEETS_API}/${encodeURIComponent(sheet.spreadsheetId)}/values/${tabRange(sheet.tab)}:append`;
    let renewed = false;
    let busy = 0;
    let fresh = values;
    for (;;) {
      let plan: CreatePlan;
      try {
        plan = planCreate(sheet, fresh, approved.values, new Date());
      } catch (error) {
        return { ok: false, error: fromLoadError(sheet, error) };
      }
      let response: AppendResponse;
      try {
        const token = await this.auth.freshToken();
        response = await firstValueFrom(
          this.http.post<AppendResponse>(
            url,
            { values: [plan.cells] },
            {
              headers: { Authorization: `Bearer ${token}` },
              params: { ...WRITE_OPTIONS, insertDataOption: 'INSERT_ROWS' },
            },
          ),
        );
      } catch (error) {
        if (error instanceof SessionEndedError) {
          return { ok: false, error: new SheetWriteError(sheet.label, 'expired', `You signed out before the product was added to ${sheet.label}.`) };
        }
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        const again = status === 401 && !renewed ? 'renew' : isBusy(error) && busy < RETRY_DELAYS_MS.length ? 'busy' : null;
        if (again === null) {
          return { ok: false, error: fromWriteError(sheet, error, status !== 429) };
        }
        if (again === 'renew') {
          renewed = true;
          this.auth.markExpired();
        } else {
          await this.wait(retryDelay(busy, error));
          busy++;
        }
        // Google saved nothing: re-read and re-check this sheet before sending again.
        try {
          fresh = await this.reader.read(sheet);
        } catch (readError) {
          return { ok: false, error: fromLoadError(sheet, readError) };
        }
        const check = this.checkNewRow(sheet, fresh, approved, true);
        if (check.kind === 'already') {
          return { ok: true, row: check.row };
        }
        if (check.kind === 'taken') {
          return { ok: false, error: new SheetWriteError(sheet.label, 'sku-taken', check.message) };
        }
        if (check.kind === 'failed') {
          return { ok: false, error: check.error };
        }
        continue;
      }

      const echoed = response.updates?.updatedData?.values?.[0] ?? [];
      if (!plan.cells.every((cell, i) => sameLogCell(cell, echoed[i]))) {
        return {
          ok: false,
          error: new SheetWriteError(
            sheet.label,
            'unconfirmed',
            `Google didn't confirm the new product in ${sheet.label}, so it may or may not have been added. Try again checks the sheet first.`,
          ),
        };
      }
      const row = appendedRow(response.updates?.updatedRange);
      if (row !== null) {
        await this.formatDateCells(sheet, row - 1, plan.dateColumns);
      }
      return { ok: true, row: { sheet, ref: createRowRef(sheet.key, plan.id), product: plan.expected } };
    }
  }

  async write(approved: ApprovedChange): Promise<WriteResult> {
    if (!ApprovedChange.isGenuine(approved)) {
      return failed('', 'not-approved', 'This change was not approved, so nothing was written.');
    }
    const targets: Target[] = [];
    for (const row of approved.rows) {
      const sheet = this.config.sheet(row.target.sheet);
      const id = rowRefId(row.target);
      if (id === undefined || id === '') {
        return failed(
          sheet.label,
          'row-missing',
          `This product has no id in ${sheet.label}, so nothing was written.`,
        );
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

    // 1b. A new SKU must be on no other row of EITHER sheet, re-checked on fresh data (US-38).
    const sku = approved.newSku();
    if (sku !== undefined) {
      const freshValues = new Map(targets.map((t, i) => [t.sheet.key, planned[i].values]));
      const taken = await this.skuTaken(sku, approved, freshValues);
      if (taken !== null) {
        return taken;
      }
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
            : new SheetWriteError(
                target.sheet.label,
                'invalid',
                `${target.sheet.label} changed while saving.`,
              );
        const remaining = approved.remaining(written.map((s) => s.sheet.key));
        return { kind: 'partial', written, error, remaining };
      }
      written.push(sent.written);
    }
    return { kind: 'written', sheets: written };
  }

  /**
   * The new SKU against BOTH sheets as they are now (US-38): a sheet already
   * re-read for this write is reused; the other is read. Any row outside the
   * user's original approval holding it fails the write with nothing written.
   */
  private async skuTaken(
    sku: string,
    approved: ApprovedChange,
    freshValues: ReadonlyMap<SheetKey, CellValue[][] | undefined>,
  ): Promise<WriteResult | null> {
    for (const key of SKU_SHEETS) {
      const sheet = this.config.sheet(key);
      let holder: string | null;
      try {
        const values = freshValues.has(key) ? freshValues.get(key) : await this.reader.read(sheet);
        holder = freshSkuHolder(sheet, values, sku, approved.owners);
      } catch (error) {
        return { kind: 'failed', error: fromLoadError(sheet, error) };
      }
      if (holder !== null) {
        return failed(
          sheet.label,
          'sku-taken',
          `SKU ${sku} is now used in ${sheet.label} (${holder}). Nothing was saved.`,
        );
      }
    }
    return null;
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
        return { ok: true, planned: { plan, tabId, values } };
      case 'conflict':
        return {
          ok: false,
          result: {
            kind: 'conflict',
            sheet,
            ref: row.target,
            current: plan.current,
            fields: plan.fields,
          },
        };
      case 'row-missing':
        return {
          ok: false,
          result: failed(
            sheet.label,
            'row-missing',
            `This product is no longer in ${sheet.label}. Nothing was written.`,
          ),
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
            data: plan.writes.map((w) => ({
              range: w.range,
              majorDimension: 'ROWS',
              values: [[w.value]],
            })),
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
      plan.writes.every((w, i) =>
        sameCell(returned[i]?.updatedData?.values?.[0]?.[0] ?? '', w.value),
      );
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
    return {
      ok: true,
      written: { sheet, ref: target.row.target, product: plan.expected, cells: plan.writes },
    };
  }

  /**
   * After a failed format or value request: a 401 renews once and a 429 waits
   * (up to the budget), each re-reading and re-checking THIS sheet only (an
   * earlier sheet may already be written). Anything else gives up.
   * `valuesSent`: whether the failed request carried values (which a 5xx or
   * network failure may have saved).
   */
  private async recover(
    target: Target,
    error: unknown,
    budget: Budget,
    valuesSent: boolean,
  ): Promise<Recovery> {
    const { sheet } = target;
    if (error instanceof SessionEndedError) {
      return {
        ok: false,
        result: failed(sheet.label, 'expired', `You signed out before ${sheet.label} was saved.`),
      };
    }
    let next: Budget;
    if (error instanceof HttpErrorResponse && error.status === 401) {
      this.auth.markExpired();
      if (!budget.mayRenew) {
        return {
          ok: false,
          result: failed(
            sheet.label,
            'expired',
            `Your session expired before ${sheet.label} was saved.`,
          ),
        };
      }
      next = { ...budget, mayRenew: false };
    } else if (isBusy(error) && budget.busyRetries < RETRY_DELAYS_MS.length) {
      // Google saved nothing: wait, then re-read and re-check before resending.
      await this.wait(retryDelay(budget.busyRetries, error));
      next = { ...budget, busyRetries: budget.busyRetries + 1 };
    } else {
      return {
        ok: false,
        result: { kind: 'failed', error: fromWriteError(sheet, error, valuesSent) },
      };
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
  return new SheetWriteError(
    sheet.label,
    'unavailable',
    `Couldn't reach ${sheet.label}. Nothing was written.`,
  );
}

function fromWriteError(
  sheet: SheetDefinition,
  error: unknown,
  valuesSent: boolean,
): SheetWriteError {
  const status = error instanceof HttpErrorResponse ? error.status : 0;
  if (status === 403) {
    return new SheetWriteError(
      sheet.label,
      'access',
      `You don't have edit access to ${sheet.label}. Ask the owner to share it with you as Editor.`,
    );
  }
  if (status === 404) {
    return new SheetWriteError(
      sheet.label,
      'not-found',
      `${sheet.label} spreadsheet not found, check configuration.`,
    );
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
  return new SheetWriteError(
    sheet.label,
    'unavailable',
    `Couldn't save to ${sheet.label}. Check your connection and try again.`,
  );
}

/** The 1-based row of an append's `updatedRange` (e.g. `'Stock Log'!A12:I12` → 12), or null. */
function appendedRow(range: string | undefined): number | null {
  const match = /![A-Z]+(\d+)/.exec(range ?? '');
  return match === null ? null : Number(match[1]);
}

/** A log cell came back as sent (numbers within a tiny tolerance; Google leaves trailing blanks out). */
function sameLogCell(sent: CellValue, echoed: CellValue | undefined): boolean {
  if (typeof sent === 'number' && typeof echoed === 'number') {
    return Math.abs(sent - echoed) < 1e-6;
  }
  return String(sent) === String(echoed ?? '');
}
