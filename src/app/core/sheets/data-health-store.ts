import { Injectable, computed, inject } from '@angular/core';

import { AppConfig } from '@core/config/app-config';
import { DataHealth, dataHealth } from './data-health';
import { SheetsStore } from './sheets-store';

/**
 * The data-health summary for the loaded sheets (US-31), as a signal. Built
 * from the pairing, so it follows every load and every confirmed save. Display
 * only: it never blocks or writes anything.
 */
@Injectable({ providedIn: 'root' })
export class DataHealthStore {
  private readonly sheets = inject(SheetsStore);
  private readonly config = inject(AppConfig);

  readonly health = computed<DataHealth>(() =>
    dataHealth(this.sheets.pairing(), this.config.sheet('dr-trust').brand),
  );

  /** The sheet labels, for the panel's headings. */
  readonly masterLabel = computed(() => this.config.sheet('master').label);
  readonly drTrustLabel = computed(() => this.config.sheet('dr-trust').label);
}
