import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AUTH_MESSAGES, Auth } from '@core/auth/auth';
import { SheetDefinition } from '@core/config/app-environment';
import { tabRange } from './a1-range';
import { CellValue } from './data-mapping';
import { SheetLoadError } from './sheet-load-error';

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
 * Failures become a `SheetLoadError` naming the sheet; a 401 also signs the
 * user out via `Auth.markExpired()`.
 */
@Injectable({ providedIn: 'root' })
export class SheetsReader {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);

  async read(sheet: SheetDefinition): Promise<CellValue[][] | undefined> {
    const token = this.auth.accessToken();
    const expiresAt = this.auth.expiresAt();
    if (token === null || (expiresAt !== null && Date.now() >= expiresAt)) {
      this.auth.markExpired();
      throw new SheetLoadError(sheet.label, 'expired', AUTH_MESSAGES.expired);
    }

    const url = `${SHEETS_API}/${encodeURIComponent(sheet.spreadsheetId)}/values/${tabRange(sheet.tab)}`;
    try {
      const response = await firstValueFrom(
        this.http.get<ValueRange>(url, {
          headers: { Authorization: `Bearer ${token}` },
          params: READ_PARAMS,
        }),
      );
      return response.values;
    } catch (error) {
      throw this.toLoadError(sheet, error);
    }
  }

  private toLoadError(sheet: SheetDefinition, error: unknown): SheetLoadError {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    switch (status) {
      case 401:
        this.auth.markExpired();
        return new SheetLoadError(sheet.label, 'expired', AUTH_MESSAGES.expired);
      case 403:
        return new SheetLoadError(
          sheet.label,
          'access',
          `You don't have access to ${sheet.label}. Ask the owner to share it with you as Editor.`,
        );
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
