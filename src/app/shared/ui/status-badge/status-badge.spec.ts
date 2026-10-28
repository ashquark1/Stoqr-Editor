import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from './status-badge';

function render(status: string): HTMLElement {
  const fixture = TestBed.createComponent(StatusBadge);
  fixture.componentRef.setInput('status', status);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('StatusBadge', () => {
  it('renders a grey pill for Inactive (AC-10)', () => {
    const span = render('Inactive').querySelector('span.stoqr-status-badge');
    expect(span?.className).toContain('stoqr-status-badge--inactive');
    expect(span?.textContent?.trim()).toBe('Inactive');
  });

  it('renders a distinct muted-red pill for Discontinued (AC-11/13)', () => {
    const span = render('Discontinued').querySelector('span.stoqr-status-badge');
    expect(span?.className).toContain('stoqr-status-badge--discontinued');
    expect(span?.textContent?.trim()).toBe('Discontinued');
  });

  it('renders Active as plain text, no pill (default view unchanged)', () => {
    const host = render('Active');
    expect(host.querySelector('span.stoqr-status-badge')).toBeNull();
    expect(host.textContent?.trim()).toBe('Active');
  });

  it('never carries a status dot (distinct from stock badges, AC-13)', () => {
    expect(
      render('Inactive').querySelector('.stoqr-badge__dot'),
    ).toBeNull();
  });
});
