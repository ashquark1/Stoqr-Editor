import { ChangeDetectionStrategy, Component } from '@angular/core';

import { EmptyState } from '@shared/ui/empty-state/empty-state';

/** Signed-in home. Placeholder until US-08 adds the temporary load-check view. */
@Component({
  selector: 'app-stock-editor',
  imports: [EmptyState],
  template: `<stoqr-empty-state message="Signed in" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockEditor {}
