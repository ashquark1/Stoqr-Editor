import { TestBed } from '@angular/core/testing';

import { SyncBadgeKind } from '@core/sheets/sync-badge';
import { SyncBadge } from './sync-badge';

function render(kind: SyncBadgeKind | undefined): HTMLElement {
  const fixture = TestBed.createComponent(SyncBadge);
  fixture.componentRef.setInput('kind', kind);
  fixture.detectChanges();
  return fixture.nativeElement;
}

describe('SyncBadge', () => {
  it.each<[SyncBadgeKind, string]>([
    ['linked', 'Linked'],
    ['master-only', 'Master only'],
    ['out-of-sync', 'Out of sync'],
    ['blocked', 'Blocked'],
  ])('renders %s as the outlined pill labelled "%s"', (kind, label) => {
    const pill = render(kind).querySelector('span.stoqr-status-badge');
    expect(pill?.classList).toContain(`sync-badge--${kind}`);
    expect(pill?.textContent?.trim()).toBe(label);
  });

  it('renders nothing for an unknown row', () => {
    expect(render(undefined).querySelector('span')).toBeNull();
  });
});
