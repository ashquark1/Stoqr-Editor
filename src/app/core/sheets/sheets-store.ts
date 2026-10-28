import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { Auth } from '@core/auth/auth';
import { AppConfig } from '@core/config/app-config';
import { LoadedProduct, isEditable } from '@core/models/product';
import { mapSheet } from './data-mapping';
import { SheetLoadError } from './sheet-load-error';
import { SheetsReader } from './sheets-reader';

const GENERIC_ERROR = "Couldn't load the products. Please try again.";

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

  readonly loading = this.loadingSignal.asReadonly();
  /** A message naming the failing sheet, or null. */
  readonly error = this.errorSignal.asReadonly();
  /** When both sheets last loaded successfully; null until then. */
  readonly fetchedAt = this.fetchedAtSignal.asReadonly();
  readonly master = this.masterSignal.asReadonly();
  readonly drTrust = this.drTrustSignal.asReadonly();
  /** Rows (both sheets) that load but cannot be edited. */
  readonly flaggedCount = computed(
    () => [...this.master(), ...this.drTrust()].filter((p) => !isEditable(p)).length,
  );

  /** Bumped on every reset so a load that finishes after sign-out is discarded. */
  private generation = 0;

  constructor() {
    effect(() => {
      if (this.auth.status() === 'signed-out') {
        this.reset();
      }
    });
  }

  /** Loads both sheets unless they are loaded or loading. Called by the page on open. */
  ensureLoaded(): Promise<void> {
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

    try {
      const [masterRows, drTrustRows] = await Promise.all([
        this.reader.read(master),
        this.reader.read(drTrust),
      ]);
      const masterProducts = mapSheet(master, masterRows);
      const drTrustProducts = mapSheet(drTrust, drTrustRows);
      if (generation !== this.generation) {
        return;
      }
      this.masterSignal.set(masterProducts);
      this.drTrustSignal.set(drTrustProducts);
      this.fetchedAtSignal.set(new Date());
    } catch (error) {
      if (generation !== this.generation) {
        return;
      }
      this.clearData();
      // An expired session is handled by Auth (back to sign-in), not shown here.
      const expired = error instanceof SheetLoadError && error.kind === 'expired';
      this.errorSignal.set(
        expired ? null : error instanceof SheetLoadError ? error.message : GENERIC_ERROR,
      );
    } finally {
      if (generation === this.generation) {
        this.loadingSignal.set(false);
      }
    }
  }

  private reset(): void {
    this.generation++;
    this.clearData();
    this.errorSignal.set(null);
    this.loadingSignal.set(false);
  }

  private clearData(): void {
    this.masterSignal.set([]);
    this.drTrustSignal.set([]);
    this.fetchedAtSignal.set(null);
  }
}
