import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AUTH_MESSAGES, Auth } from '@core/auth/auth';
import { SheetDefinition } from '@core/config/app-environment';
import { tabRange } from './a1-range';
import { CellValue } from './data-mapping';
import { SheetLoadError, noAccessMessage } from './sheet-load-error';

export const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

/**
 * Read options (US-08): raw numbers rather than display text, dates as the
 * sheet's formatted text. Not gviz (AI_CONTRACT).
 */
export const READ_PARAMS = {
  majorDimension: 'ROWS',
  valueRenderOption: 'UNFORMATTED_VALUE',
  dateTimeRenderOption: 'FORMATTED_STRING',
} as const;

/** The part of a Sheets API `ValueRange` the app uses. `values` is absent for an empty tab. */
interface ValueRange {
  readonly values?: CellValue[][];
}

/**
 * Reads a whole tab of one spreadsheet with the signed-in user's token. GET
 * only: the only file that may send a mutating request is `sheets-writer.ts`.
 * Failures become a `SheetLoadError` naming the sheet. A token that expires —
 * before the call or as a 401 — waits for the user to renew (US-06) and the
 * GET is retried once, so an interrupted load finishes after Continue.
 */
@Injectable({ providedIn: 'root' })
export class SheetsReader {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);

  async read(sheet: SheetDefinition): Promise<CellValue[][] | undefined> {
    try {
      return await this.get(sheet, await this.token(sheet));
    } catch (error) {
      if (!isUnauthorized(error)) {
        throw error instanceof SheetLoadError ? error : this.toLoadError(sheet, error);
      }
      this.auth.markExpired();
    }
    // One retry after renewal; a second 401 is reported as an expired session.
    try {
      return await this.get(sheet, await this.token(sheet));
    } catch (error) {
      if (isUnauthorized(error)) {
        this.auth.markExpired();
        throw expiredError(sheet);
      }
      throw error instanceof SheetLoadError ? error : this.toLoadError(sheet, error);
    }
  }

  /** Waits for a valid token (renewal included); a session that ends instead is "expired". */
  private async token(sheet: SheetDefinition): Promise<string> {
    try {
      return await this.auth.freshToken();
    } catch {
      throw expiredError(sheet);
    }
  }

  private async get(sheet: SheetDefinition, token: string): Promise<CellValue[][] | undefined> {
    const url = `${SHEETS_API}/${encodeURIComponent(sheet.spreadsheetId)}/values/${tabRange(sheet.tab)}`;
    const response = await firstValueFrom(
      this.http.get<ValueRange>(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: READ_PARAMS,
      }),
    );
    return response.values;
  }

  private toLoadError(sheet: SheetDefinition, error: unknown): SheetLoadError {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    switch (status) {
      case 401:
        return expiredError(sheet);
      case 403:
        return new SheetLoadError(sheet.label, 'access', noAccessMessage([sheet.label]));
      case 404:
        return new SheetLoadError(
          sheet.label,
          'not-found',
          `${sheet.label} spreadsheet not found, check configuration.`,
        );
      case 400:
        if (error instanceof HttpErrorResponse && /unable to parse range/i.test(JSON.stringify(error.error ?? ''))) {
          return new SheetLoadError(sheet.label, 'tab', `Tab ${sheet.tab} not found in ${sheet.label}.`);
        }
        break;
    }
    return new SheetLoadError(
      sheet.label,
      'unavailable',
      `Couldn't load ${sheet.label}. Check your connection and try again.`,
    );
  }
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 401;
}

function expiredError(sheet: SheetDefinition): SheetLoadError {
  return new SheetLoadError(sheet.label, 'expired', AUTH_MESSAGES.expired);
}
