import { Injectable, effect, inject, signal, untracked } from '@angular/core';

import { AppConfig } from '@core/config/app-config';
import { SheetLoadError } from '@core/sheets/sheet-load-error';
import { SheetsReader } from '@core/sheets/sheets-reader';
import { SheetsStore } from '@core/sheets/sheets-store';
import { resolveLogHeaders } from '@core/sheets/stock-log-map';

/**
 * Whether the Stock Log can be written (US-94): `checking` until the header
 * row is read; `ready`; `no-access` (403); `unusable` (not set up, sheet or
 * tab not found, a header missing); `unknown` (network / Google busy — stock
 * changes stay on; the append itself would then fail visibly).
 */
export type StockLogStatus = 'checking' | 'ready' | 'no-access' | 'unusable' | 'unknown';

/**
 * The Stock Log's load-time check (CR-05, US-94): after the product sheets
 * load (and on every Refresh), reads the log's header row and checks the nine
 * labels. Never blocks or fails the product load. A read proves read access
 * only: a View-only person passes and their first append fails (a "Retry log"
 * case, US-95/96). The switch-off of stock changes is US-95.
 */
@Injectable({ providedIn: 'root' })
export class StockLogStore {
  private readonly config = inject(AppConfig);
  private readonly reader = inject(SheetsReader);
  private readonly sheets = inject(SheetsStore);

  private readonly statusSignal = signal<StockLogStatus>('checking');
  private readonly messageSignal = signal<string | null>(null);
  private generation = 0;

  readonly status = this.statusSignal.asReadonly();
  /** Why the log cannot be used, for the US-96 message; null when ready or checking. */
  readonly message = this.messageSignal.asReadonly();

  constructor() {
    let lastFetch: number | null = null;
    effect(() => {
      const fetchedAt = this.sheets.fetchedAt()?.getTime() ?? null;
      if (fetchedAt !== null && fetchedAt !== lastFetch) {
        lastFetch = fetchedAt;
        untracked(() => void this.check());
      }
    });
  }

  /** Reads the log's header row and sets the status. A newer check wins over an older one. */
  async check(): Promise<void> {
    const generation = ++this.generation;
    const log = this.config.stockLog();
    if (log === null) {
      this.set(generation, 'unusable', 'The Stock Log sheet is not set up.');
      return;
    }
    this.set(generation, 'checking', null);
    try {
      const header = resolveLogHeaders(await this.reader.readHeader(log));
      if (header.ok) {
        this.set(generation, 'ready', null);
      } else {
        this.set(
          generation,
          'unusable',
          `The ${log.label} sheet is missing the column ${header.missing.join(', ')}.`,
        );
      }
    } catch (error) {
      if (error instanceof SheetLoadError && error.kind === 'access') {
        this.set(generation, 'no-access', `You don't have access to the ${log.label} sheet.`);
      } else if (
        error instanceof SheetLoadError &&
        (error.kind === 'not-found' || error.kind === 'tab')
      ) {
        this.set(generation, 'unusable', error.message);
      } else {
        this.set(generation, 'unknown', error instanceof Error ? error.message : null);
      }
    }
  }

  private set(generation: number, status: StockLogStatus, message: string | null): void {
    if (generation === this.generation) {
      this.statusSignal.set(status);
      this.messageSignal.set(message);
    }
  }
}
