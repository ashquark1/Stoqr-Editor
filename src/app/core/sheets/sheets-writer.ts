import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Auth, SessionEndedError } from '@core/auth/auth';
import { SheetDefinition } from '@core/config/app-environment';
import { LoadedProduct, Product } from '@core/models/product';
import { ApprovedChange, InvalidChangeError, RowChange } from './approval';
import { CellValue } from './data-mapping';
import { rowRefId } from './row-ref';
import { SheetLoadError } from './sheet-load-error';
import { SHEETS_API, SheetsReader } from './sheets-reader';
import { CellWrite, planRowWrite } from './write-plan';

export type WriteFailureKind =
  | 'not-approved'
  | 'wrong-sheet'
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

export type WriteResult =
  | { readonly kind: 'written'; readonly product: Product; readonly cells: readonly CellWrite[] }
  | { readonly kind: 'conflict'; readonly current: LoadedProduct; readonly fields: readonly (keyof Product)[] }
  | { readonly kind: 'failed'; readonly error: SheetWriteError };

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

/** The part of a `values:batchUpdate` response the writer checks. */
interface BatchUpdateResponse {
  readonly responses?: readonly { readonly updatedData?: { readonly values?: CellValue[][] } }[];
}

/**
 * THE ONLY code that changes a spreadsheet (AI_CONTRACT: Writes). One row in
 * one sheet per call, parameterised by the sheet definition. It takes only a
 * genuine `ApprovedChange`, re-reads the tab and re-checks the row (by `id`)
 * and every reviewed value, writes exact single cells in one request, fills in
 * Stock Status and Last Updated itself, and reports `written` only after
 * Google returns every value it was sent.
 */
@Injectable({ providedIn: 'root' })
export class SheetsWriter {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly reader = inject(SheetsReader);

  async write(sheet: SheetDefinition, approved: ApprovedChange): Promise<WriteResult> {
    if (!ApprovedChange.isGenuine(approved)) {
      return failed(sheet, 'not-approved', 'This change was not approved, so nothing was written.');
    }
    const change = approved.change;
    if (change.target.sheet !== sheet.key) {
      return failed(sheet, 'wrong-sheet', `This change is for another sheet, not ${sheet.label}.`);
    }
    const id = rowRefId(change.target);
    if (id === undefined || id === '') {
      return failed(sheet, 'row-missing', `This product has no id in ${sheet.label}, so it cannot be written.`);
    }
    return this.attempt(sheet, change, id, true);
  }

  private async attempt(sheet: SheetDefinition, change: RowChange, id: string, mayRetry: boolean): Promise<WriteResult> {
    // 1. Re-read the whole tab: headers and the row may have moved since the load.
    let values;
    try {
      values = await this.reader.read(sheet);
    } catch (error) {
      return { kind: 'failed', error: fromLoadError(sheet, error) };
    }

    // 2. Plan against the fresh data (row by id, reviewed values, derived fields).
    let plan;
    try {
      plan = planRowWrite(sheet, values, id, change, new Date());
    } catch (error) {
      if (error instanceof SheetLoadError) {
        return { kind: 'failed', error: fromLoadError(sheet, error) };
      }
      if (error instanceof InvalidChangeError || error instanceof RangeError) {
        return failed(sheet, 'invalid', error.message);
      }
      throw error;
    }
    if (plan.kind === 'conflict') {
      return { kind: 'conflict', current: plan.current, fields: plan.fields };
    }
    if (plan.kind === 'row-missing') {
      return failed(sheet, 'row-missing', `This product is no longer in ${sheet.label}. Nothing was written.`);
    }
    if (plan.kind === 'row-duplicated') {
      return failed(sheet, 'row-duplicated', `This product's id now appears twice in ${sheet.label}. Nothing was written.`);
    }

    // 3. One request with exact cells only.
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
      if (error instanceof SessionEndedError) {
        return failed(sheet, 'expired', 'You signed out before the change was saved. Nothing was written.');
      }
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.auth.markExpired();
        // Absolute values + a fresh re-read and re-check make one retry safe.
        return mayRetry
          ? this.attempt(sheet, change, id, false)
          : failed(sheet, 'expired', 'Your session expired before the change was saved. Nothing was written.');
      }
      return { kind: 'failed', error: fromWriteError(sheet, error) };
    }

    // 4. Success only once Google returns every value it was sent.
    const returned = response.responses ?? [];
    const confirmed =
      returned.length === plan.writes.length &&
      plan.writes.every((w, i) => sameCell(returned[i]?.updatedData?.values?.[0]?.[0] ?? '', w.value));
    if (!confirmed) {
      return failed(
        sheet,
        'unconfirmed',
        `Google did not confirm the change in ${sheet.label}. Reload to check it before trying again.`,
      );
    }
    return { kind: 'written', product: plan.expected, cells: plan.writes };
  }
}

/** Text must match exactly; numbers within a hair (a date serial may round in transit). */
function sameCell(returned: CellValue, sent: CellValue): boolean {
  if (typeof returned === 'number' && typeof sent === 'number') {
    return Math.abs(returned - sent) < 1e-9;
  }
  return returned === sent;
}

function failed(sheet: SheetDefinition, kind: WriteFailureKind, message: string): WriteResult {
  return { kind: 'failed', error: new SheetWriteError(sheet.label, kind, message) };
}

function fromLoadError(sheet: SheetDefinition, error: unknown): SheetWriteError {
  if (error instanceof SheetLoadError) {
    const kind: WriteFailureKind =
      error.kind === 'tab' ? 'not-found' : error.kind === 'columns' ? 'columns' : error.kind;
    return new SheetWriteError(sheet.label, kind, `${error.message} Nothing was written.`);
  }
  return new SheetWriteError(sheet.label, 'unavailable', `Couldn't reach ${sheet.label}. Nothing was written.`);
}

function fromWriteError(sheet: SheetDefinition, error: unknown): SheetWriteError {
  const status = error instanceof HttpErrorResponse ? error.status : 0;
  if (status === 403) {
    return new SheetWriteError(
      sheet.label,
      'access',
      `You don't have edit access to ${sheet.label}. Ask the owner to share it with you as Editor. Nothing was written.`,
    );
  }
  if (status === 404) {
    return new SheetWriteError(sheet.label, 'not-found', `${sheet.label} spreadsheet not found, check configuration.`);
  }
  return new SheetWriteError(
    sheet.label,
    'unavailable',
    `Couldn't save to ${sheet.label}. Check your connection and try again.`,
  );
}
