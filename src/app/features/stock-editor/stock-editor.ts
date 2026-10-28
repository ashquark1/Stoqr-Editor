import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { Auth } from '@core/auth/auth';
import { AppConfig } from '@core/config/app-config';
import { SheetKey } from '@core/config/app-environment';
import { PRODUCT_ISSUE_LABELS } from '@core/models/product';
import { SheetsStore } from '@core/sheets/sheets-store';
import { Badge } from '@shared/ui/badge/badge';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { LoadingOverlay } from '@shared/ui/loading-overlay/loading-overlay';
import { StatusBadge } from '@shared/ui/status-badge/status-badge';
import { displayValue } from '@shared/util/display-value';

/**
 * TEMPORARY load-check view (US-08): per-sheet counts and a read-only table so
 * the owner can see both sheets loaded. Replaced by the picker (US-12, US-13).
 */
@Component({
  selector: 'app-stock-editor',
  imports: [Badge, EmptyState, LoadingOverlay, StatusBadge],
  templateUrl: './stock-editor.html',
  styleUrl: './stock-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockEditor {
  protected readonly store = inject(SheetsStore);
  protected readonly config = inject(AppConfig);
  protected readonly auth = inject(Auth);
  protected readonly issueLabels = PRODUCT_ISSUE_LABELS;
  protected readonly display = displayValue;

  /** View state: which sheet the table shows. */
  protected readonly selected = signal<SheetKey>('master');
  protected readonly rows = computed(() =>
    this.selected() === 'master' ? this.store.master() : this.store.drTrust(),
  );

  constructor() {
    void this.store.ensureLoaded();
  }
}
