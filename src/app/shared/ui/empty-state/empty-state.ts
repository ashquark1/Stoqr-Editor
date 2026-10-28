import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Themed empty-results placeholder. Message is overridable; extra content
 *  (e.g. a hint or action) can be projected. */
@Component({
  selector: 'stoqr-empty-state',
  template: `
    <div class="stoqr-empty-state">
      <p class="stoqr-empty-state__message">{{ message() }}</p>
      <ng-content />
    </div>
  `,
  styleUrl: './empty-state.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyState {
  readonly message = input('No results found.');
}
