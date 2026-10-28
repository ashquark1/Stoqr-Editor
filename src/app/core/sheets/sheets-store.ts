import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { Auth } from '@core/auth/auth';
import { AppConfig } from '@core/config/app-config';
import { LoadedProduct, isEditable } from '@core/models/product';
import { mapSheet } from './data-mapping';
import { SheetLoadError, combineLoadErrors } from './sheet-load-error';
import { pairSheets, pairingCounts } from './sheet-pairing';
import { SheetsReader } from './sheets-reader';

const GENERIC_ERROR = "Couldn't load the products. Please try again.";
export const INTERRUPTED_ERROR = 'Loading was interrupted by the session ending. Please retry.';

/**
 * Both sheets, loaded once per session after sign-in (US-08). All-or-nothing:
 * data is set only when both sheets load and map; any failure shows no data.
 * Cleared on sign-out or session expiry so the next user never sees old rows.
 */
@Injectable({ providedIn: 'root' })
export class SheetsStore {
  private readonly reader = inject(SheetsReader);
  private readonly config = inject(AppConfig);
  private readonly auth = inject(Auth);

  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private readonly fetchedAtSignal = signal<Date | null>(null);
  private readonly masterSignal = signal<readonly LoadedProduct[]>([]);
  private readonly drTrustSignal = signal<readonly LoadedProduct[]>([]);
  private readonly noAccessSignal = signal(false);

  readonly loading = this.loadingSignal.asReadonly();
  /** A message naming every failing sheet, or null. */
  readonly error = this.errorSignal.asReadonly();
  /** True when the last load failed because the account cannot open at least one sheet (US-32). */
  readonly noAccess = this.noAccessSignal.asReadonly();
  /** When both sheets last loaded successfully; null until then. */
  readonly fetchedAt = this.fetchedAtSignal.asReadonly();
  readonly master = this.masterSignal.asReadonly();
  readonly drTrust = this.drTrustSignal.asReadonly();
  /** Rows (both sheets) that load but cannot be edited. */
  readonly flaggedCount = computed(
    () => [...this.master(), ...this.drTrust()].filter((p) => !isEditable(p)).length,
  );
  /** Rows paired across the two sheets by SKU (US-30); follows the loaded data. */
  readonly pairing = computed(() => pairSheets(this.master(), this.drTrust()));
  readonly pairingCounts = computed(() => pairingCounts(this.pairing()));

  /** Bumped on every reset so a load that finishes after a new session starts is discarded. */
  private generation = 0;
  /** True once a page has asked for the sheets in this session (so a new session reloads them). */
  private requested = false;

  constructor() {
    // A new session (sign-out, or a different account on renewal) clears everything; expiry
    // does not, so work survives renewal (US-06). A different account reloads the sheets.
    let lastSession = this.auth.sessionId();
    effect(() => {
      const session = this.auth.sessionId();
      if (session === lastSession) {
        return;
      }
      lastSession = session;
      untracked(() => {
        const wasRequested = this.requested;
        this.reset();
        if (wasRequested && this.auth.status() === 'signed-in') {
          void this.ensureLoaded();
        }
      });
    });
  }

  /** Loads both sheets unless they are loaded or loading. Called by the page on open. */
  ensureLoaded(): Promise<void> {
    this.requested = true;
    if (this.fetchedAtSignal() !== null || this.loadingSignal()) {
      return Promise.resolve();
    }
    return this.load();
  }

  /** Retry: loads both sheets again. */
  reload(): Promise<void> {
    return this.load();
  }

  private async load(): Promise<void> {
    const generation = this.generation;
    const master = this.config.sheet('master');
    const drTrust = this.config.sheet('dr-trust');
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    this.noAccessSignal.set(false);

    try {
      // Wait for both, so a failure names every sheet that failed (US-32).
      const [masterRead, drTrustRead] = await Promise.allSettled([
        this.reader.read(master),
        this.reader.read(drTrust),
      ]);
      if (generation !== this.generation) {
        return;
      }
      if (masterRead.status === 'rejected' || drTrustRead.status === 'rejected') {
        this.clearData();
        this.showFailures(
          [masterRead, drTrustRead].flatMap((r) => (r.status === 'rejected' ? [r.reason] : [])),
        );
        return;
      }
      // Map both before setting either, so a column error in one never leaves the other shown.
      const masterProducts = mapSheet(master, masterRead.value);
      const drTrustProducts = mapSheet(drTrust, drTrustRead.value);
      this.masterSignal.set(masterProducts);
      this.drTrustSignal.set(drTrustProducts);
      this.fetchedAtSignal.set(new Date());
    } catch (mappingError) {
      // A missing or duplicated column (US-09): nothing has been set yet.
      if (generation !== this.generation) {
        return;
      }
      this.clearData();
      this.showFailures([mappingError]);
    } finally {
      if (generation === this.generation) {
        this.loadingSignal.set(false);
      }
    }
  }

  /** All-or-nothing: data is already cleared; this only sets the message and the no-access flag. */
  private showFailures(failures: readonly unknown[]): void {
    const loadErrors = failures.filter((f): f is SheetLoadError => f instanceof SheetLoadError);
    if (loadErrors.length < failures.length) {
      this.errorSignal.set(GENERIC_ERROR);
      return;
    }
    // An expired session yields null when the user has signed out (they are on the sign-in
    // screen). If they still have a session (e.g. a second 401 after renewal), offer Retry.
    const message = combineLoadErrors(loadErrors);
    this.errorSignal.set(
      message === null && loadErrors.length > 0 && this.auth.hasSession() ? INTERRUPTED_ERROR : message,
    );
    this.noAccessSignal.set(loadErrors.some((e) => e.kind === 'access'));
  }

  private reset(): void {
    this.requested = false;
    this.generation++;
    this.clearData();
    this.errorSignal.set(null);
    this.noAccessSignal.set(false);
    this.loadingSignal.set(false);
  }

  private clearData(): void {
    this.masterSignal.set([]);
    this.drTrustSignal.set([]);
    this.fetchedAtSignal.set(null);
  }
}
