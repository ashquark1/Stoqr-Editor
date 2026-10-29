import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AUTH_MESSAGES, Auth } from '@core/auth/auth';
import { SheetDefinition } from '@core/config/app-environment';
import { tabRange } from './a1-range';
import { RETRY_DELAYS_MS, RETRY_WAIT, isBusy, isTransient, retryDelay } from './backoff';
import { CellValue } from './data-mapping';
import { SheetLoadError, noAccessMessage } from './sheet-load-error';

export const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

/** Shown when Google still says "too many requests" after every retry (US-11). */
export const BUSY_LOAD_MESSAGE = 'Google is busy right now (too many requests). Wait a minute, then Retry.';

/**
 * Read options (US-08): raw numbers rather than display text, dates as the
 * sheet's formatted text. Not gviz (AI_CONTRACT).
 */
export const READ_PARAMS = {
  majorDimension: 'ROWS',
  valueRenderOption: 'UNFORMATTED_VALUE',
  dateTimeRenderOption: 'FORMATTED_STRING',
} as const;

/** Only the tab properties: a tab's internal number is needed to format a cell (US-19 fix). */
export const TAB_FIELDS = 'sheets.properties(sheetId,title)';

/** The part of a Sheets API `ValueRange` the app uses. `values` is absent for an empty tab. */
interface ValueRange {
  readonly values?: CellValue[][];
}

/** The part of a Sheets API `Spreadsheet` that `TAB_FIELDS` asks for. */
interface SpreadsheetTabs {
  readonly sheets?: readonly { readonly properties?: { readonly sheetId?: number; readonly title?: string } }[];
}

/**
 * Reads a whole tab of one spreadsheet with the signed-in user's token. GET
 * only: the only file that may send a mutating request is `sheets-writer.ts`.
 * Failures become a `SheetLoadError` naming the sheet. A token that expires —
 * before the call or as a 401 — waits for the user to renew (US-06) and the
 * GET is retried once, so an interrupted load finishes after Continue. Busy
 * (429), outage (5xx) and network failures are retried with backoff (US-11);
 * reads change nothing, so that is always safe.
 */
@Injectable({ providedIn: 'root' })
export class SheetsReader {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly wait = inject(RETRY_WAIT);

  async read(sheet: SheetDefinition): Promise<CellValue[][] | undefined> {
    return this.request(sheet, (token) => this.getValues(sheet, token));
  }

  /**
   * The internal number (`sheetId`) of the sheet's tab, found by its exact
   * title. Fetched fresh for every write, never cached: a tab deleted and
   * re-created gets a new number. A missing tab is a 'tab' `SheetLoadError`.
   */
  async tabId(sheet: SheetDefinition): Promise<number> {
    const response = await this.request(sheet, (token) => this.getTabs(sheet, token));
    const tab = (response.sheets ?? []).find((s) => s.properties?.title === sheet.tab);
    if (tab === undefined) {
      throw new SheetLoadError(sheet.label, 'tab', `Tab ${sheet.tab} not found in ${sheet.label}.`);
    }
    // Google leaves out a sheetId of 0 (a default value), which is the first tab's.
    return tab.properties?.sheetId ?? 0;
  }

  /** One GET with renewal and backoff; failures become a `SheetLoadError` naming the sheet. */
  private async request<T>(sheet: SheetDefinition, get: (token: string) => Promise<T>): Promise<T> {
    try {
      return await this.fetch(sheet, get);
    } catch (error) {
      if (!isUnauthorized(error)) {
        throw error instanceof SheetLoadError ? error : this.toLoadError(sheet, error);
      }
      this.auth.markExpired();
    }
    // One retry after renewal; a second 401 is reported as an expired session.
    try {
      return await this.fetch(sheet, get);
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

  /** One GET, retried with backoff on transient errors; a fresh token for every try. */
  private async fetch<T>(sheet: SheetDefinition, get: (token: string) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await get(await this.token(sheet));
      } catch (error) {
        if (!isTransient(error) || attempt >= RETRY_DELAYS_MS.length) {
          throw error;
        }
        await this.wait(retryDelay(attempt, error));
      }
    }
  }

  private async getValues(sheet: SheetDefinition, token: string): Promise<CellValue[][] | undefined> {
    const url = `${SHEETS_API}/${encodeURIComponent(sheet.spreadsheetId)}/values/${tabRange(sheet.tab)}`;
    const response = await firstValueFrom(
      this.http.get<ValueRange>(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: READ_PARAMS,
      }),
    );
    return response.values;
  }

  private getTabs(sheet: SheetDefinition, token: string): Promise<SpreadsheetTabs> {
    return firstValueFrom(
      this.http.get<SpreadsheetTabs>(`${SHEETS_API}/${encodeURIComponent(sheet.spreadsheetId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { fields: TAB_FIELDS },
      }),
    );
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
    if (isBusy(error)) {
      return new SheetLoadError(sheet.label, 'unavailable', BUSY_LOAD_MESSAGE);
    }
    if (isTransient(error) || !(error instanceof HttpErrorResponse)) {
      return new SheetLoadError(
        sheet.label,
        'unavailable',
        `Couldn't reach Google to load ${sheet.label}. Check your connection, then Retry.`,
      );
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
