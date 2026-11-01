import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { Auth } from '@core/auth/auth';
import { AppConfig } from '@core/config/app-config';
import { SheetLoadError } from '@core/sheets/sheet-load-error';
import { SheetsReader } from '@core/sheets/sheets-reader';
import { SheetsStore } from '@core/sheets/sheets-store';
import { SheetsWriter } from '@core/sheets/sheets-writer';
import { LogRow, resolveLogHeaders } from '@core/sheets/stock-log-map';
import { LogChange, logLine } from './stock-log-line';

/**
 * Whether the Stock Log can be written (US-94): `checking` until the header
 * row is read; `ready`; `no-access` (403); `unusable` (not set up, sheet or
 * tab not found, a header missing); `unknown` (network / Google busy — stock
 * changes stay on; the append itself would then fail visibly).
 */
export type StockLogStatus = 'checking' | 'ready' | 'no-access' | 'unusable' | 'unknown';

/** The change a line is for, without the user (the store adds the first name). */
export type LogEntry = Omit<LogChange, 'user'>;

/**
 * The Stock Log (CR-05). Load-time check (US-94): after the product sheets
 * load (and on every Refresh), reads the log's header row and checks the nine
 * labels; never blocks or fails the product load. A read proves read access
 * only: a View-only person passes and their first append fails (a "Retry log"
 * case). Lines (US-95): `record()` follows each confirmed Master stock write
 * of the same tap and is the one caller of `appendLogLine` for stock; lines go
 * out IN ORDER, and a failed line waits (with any behind it) for Retry log.
 * Without log access (`stockChangesOff`) stock changes are refused in core.
 */
@Injectable({ providedIn: 'root' })
export class StockLogStore {
  private readonly config = inject(AppConfig);
  private readonly reader = inject(SheetsReader);
  private readonly sheets = inject(SheetsStore);
  private readonly writer = inject(SheetsWriter);
  private readonly auth = inject(Auth);

  private readonly statusSignal = signal<StockLogStatus>('checking');
  private readonly messageSignal = signal<string | null>(null);
  private readonly pendingSignal = signal<readonly LogRow[]>([]);
  private readonly loggingSignal = signal(false);
  private readonly failureSignal = signal<string | null>(null);
  private generation = 0;
  private session = 0;

  readonly status = this.statusSignal.asReadonly();
  /** Why the log cannot be used, for the US-96 message; null when ready or checking. */
  readonly message = this.messageSignal.asReadonly();
  /**
   * Stock changes are off (US-95): no access to the log, or it is unusable (incl.
   * not set up). Checking and unknown stay on (a failed line becomes Retry log).
   */
  readonly stockChangesOff = computed(
    () => this.statusSignal() === 'no-access' || this.statusSignal() === 'unusable',
  );
  /** Why stock changes are off, or null. */
  readonly offReason = computed(() => (this.stockChangesOff() ? this.messageSignal() : null));
  /** The no-access message (US-96): what is wrong and the way out; null while stock changes are on. */
  readonly offMessage = computed(() => {
    if (this.statusSignal() === 'no-access') {
      return `You don't have access to the ${this.config.stockLog()?.label ?? 'Stock Log'} sheet, so stock changes are switched off. Ask the owner to share it with you as Editor.`;
    }
    if (this.statusSignal() === 'unusable') {
      return `${this.messageSignal() ?? 'The Stock Log sheet can\'t be used.'} Stock changes are switched off until it's fixed.`;
    }
    return null;
  });
  /** Lines of confirmed changes not yet in the log, oldest first (Retry log sends them). */
  readonly pending = this.pendingSignal.asReadonly();
  readonly hasPending = computed(() => this.pendingSignal().length > 0);
  /** A line is being appended (Retry log shows "Logging…", US-96). */
  readonly logging = this.loggingSignal.asReadonly();
  /** Why the last line could not be written, or null. */
  readonly failure = this.failureSignal.asReadonly();

  constructor() {
    // Pending lines are the user's work: dropped on sign-out or another account, kept on expiry.
    let lastSession = untracked(() => this.auth.sessionId());
    effect(() => {
      const id = this.auth.sessionId();
      if (id !== lastSession) {
        lastSession = id;
        this.session++;
        this.pendingSignal.set([]);
        this.failureSignal.set(null);
        this.loggingSignal.set(false);
      }
    });

    let lastFetch: number | null = null;
    effect(() => {
      const fetchedAt = this.sheets.fetchedAt()?.getTime() ?? null;
      if (fetchedAt !== null && fetchedAt !== lastFetch) {
        lastFetch = fetchedAt;
        untracked(() => void this.check());
      }
    });
  }

  /**
   * The line for a confirmed Master stock change (US-95), built ONCE so its
   * Change ID is fixed, and returned at once (Undo names it). Not awaited by
   * the save: the stock outcome never depends on the log. Sent at once unless
   * earlier lines are pending; then it waits behind them (order kept).
   */
  record(entry: LogEntry): string {
    const line = logLine({ ...entry, user: this.auth.firstName() }, new Date());
    const queued = this.pendingSignal().length > 0 || this.loggingSignal();
    this.pendingSignal.update((lines) => [...lines, line]);
    if (!queued) {
      void this.send(false);
    }
    return String(line.changeId);
  }

  /**
   * The user's Retry log tap (US-95/96): only with lines pending and nothing
   * being sent, so a double tap sends once. First drops lines already in the
   * log (an unconfirmed append that landed), then sends the rest in order.
   */
  async retryLog(): Promise<void> {
    if (this.pendingSignal().length === 0 || this.loggingSignal()) {
      return;
    }
    await this.send(true);
  }

  /** Appends pending lines in order, stopping at the first failure. */
  private async send(checkFirst: boolean): Promise<void> {
    const session = this.session;
    this.loggingSignal.set(true);
    this.failureSignal.set(null);
    try {
      if (checkFirst) {
        let present: Set<string> | null;
        try {
          present = await this.loggedIds();
        } catch (error) {
          // Never risk a second copy: without the check, nothing is sent.
          if (session === this.session) {
            this.failureSignal.set(
              error instanceof Error ? error.message : "Couldn't check the Stock Log sheet.",
            );
          }
          return;
        }
        if (session !== this.session) {
          return;
        }
        if (present !== null) {
          this.pendingSignal.update((lines) => lines.filter((l) => !present.has(String(l.changeId))));
        }
      }
      for (let line = this.pendingSignal()[0]; line !== undefined; line = this.pendingSignal()[0]) {
        const result = await this.writer.appendLogLine(line);
        if (session !== this.session) {
          return;
        }
        if (result.kind !== 'logged') {
          this.failureSignal.set(result.message);
          return;
        }
        this.pendingSignal.update((lines) => lines.filter((l) => l !== line));
      }
    } finally {
      if (session === this.session) {
        this.loggingSignal.set(false);
      }
    }
  }

  /**
   * The Change IDs already in the log. Null when the log is not set up or a
   * header is missing (the append then fails with that reason, adding
   * nothing). A read failure throws (nothing is sent).
   */
  private async loggedIds(): Promise<Set<string> | null> {
    const log = this.config.stockLog();
    if (log === null) {
      return null;
    }
    const header = resolveLogHeaders(await this.reader.readHeader(log));
    const column = header.ok ? header.columns.get('changeId') : undefined;
    if (column === undefined) {
      return null;
    }
    const ids = await this.reader.readColumn(log, column);
    return new Set(ids.map((id) => String(id).trim()));
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
