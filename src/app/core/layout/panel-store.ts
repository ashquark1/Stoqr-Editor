import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { Auth } from '@core/auth/auth';
import { DataHealthStore } from '@core/sheets/data-health-store';
import { SheetsStore } from '@core/sheets/sheets-store';

/** The floating panels; one may be open at a time (US-71). */
export type PanelKey = 'data-health' | 'filters';

/**
 * Which panel is open, shared by the app shell (its buttons live in the bottom
 * bar) and the editor page (it shows the panel). US-51. View state only: it
 * never reads or writes sheet data beyond knowing whether the sheets have loaded.
 */
@Injectable({ providedIn: 'root' })
export class PanelStore {
  private readonly auth = inject(Auth);
  private readonly sheets = inject(SheetsStore);
  private readonly health = inject(DataHealthStore);

  private readonly openSignal = signal<PanelKey | null>(null);
  private readonly newProductSignal = signal(false);
  private readonly newProductRequestSignal = signal(0);

  readonly healthOpen = computed(() => this.openSignal() === 'data-health');
  /** The filter panel (US-69 button, US-70 panel). */
  readonly filtersOpen = computed(() => this.openSignal() === 'filters');

  /** The New product shell is open (US-93; its rules are US-98). */
  readonly newProductOpen = this.newProductSignal.asReadonly();
  /**
   * Bumped by the bottom bar's Add product button. `ProductNavigation` answers
   * it (it may ask "Discard changes?" first); the shell itself never imports
   * navigation, which keeps the search and editor stores out of the first load.
   */
  readonly newProductRequest = this.newProductRequestSignal.asReadonly();

  /** The Data health button's count, and its accessible name ("Data health, 2 issues"). */
  readonly healthCount = computed(() => this.health.health().total);
  readonly healthLabel = computed(() => {
    const n = this.healthCount();
    return `Data health, ${n === 0 ? 'no issues' : n === 1 ? '1 issue' : `${n} issues`}`;
  });

  /** Data health may be offered once the sheets have loaded (an empty master counts), not while loading or after a load error. */
  readonly healthAvailable = computed(
    () =>
      this.sheets.fetchedAt() !== null && !this.sheets.loading() && this.sheets.error() === null,
  );

  constructor() {
    // A new session (sign-out, or a different account) starts with every panel closed.
    let lastSession = this.auth.sessionId();
    effect(() => {
      const session = this.auth.sessionId();
      if (session !== lastSession) {
        lastSession = session;
        this.openSignal.set(null);
        this.newProductSignal.set(false);
      }
    });
  }

  /** The Add product button: asks navigation to open or close the New product shell. */
  requestNewProduct(): void {
    this.newProductRequestSignal.update((n) => n + 1);
  }

  /** Opens the New product shell and closes the floating panels (call through `ProductNavigation`). */
  openNewProduct(): void {
    this.openSignal.set(null);
    this.newProductSignal.set(true);
  }

  closeNewProduct(): void {
    this.newProductSignal.set(false);
  }

  toggleHealth(): void {
    this.openSignal.update((open) => (open === 'data-health' ? null : 'data-health'));
  }

  closeHealth(): void {
    this.openSignal.update((open) => (open === 'data-health' ? null : open));
  }

  toggleFilters(): void {
    this.openSignal.update((open) => (open === 'filters' ? null : 'filters'));
  }

  closeFilters(): void {
    this.openSignal.update((open) => (open === 'filters' ? null : open));
  }
}
