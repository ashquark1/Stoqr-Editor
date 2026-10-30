import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Themed empty-results placeholder. Message is overridable; extra content
 *  (e.g. a hint or action) can be projected. Optional `heading` above the
 *  message (US-47; not called `title`, which would also show a browser tooltip
 *  on the host), and `alert` for problem cards so screen readers announce them. */
@Component({
  selector: 'stoqr-empty-state',
  template: `
    <div class="stoqr-empty-state" [attr.role]="alert() ? 'alert' : null">
      @if (heading()) {
        <h2 class="stoqr-empty-state__heading">{{ heading() }}</h2>
      }
      <p class="stoqr-empty-state__message">{{ message() }}</p>
      <ng-content />
    </div>
  `,
  styleUrl: './empty-state.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyState {
  readonly message = input('No results found.');

  /** Card title, e.g. "Couldn't load the products". Empty shows none. */
  readonly heading = input('');

  /** A problem card: announced at once (`role="alert"`). */
  readonly alert = input(false);
}
