import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Badge } from './badge';

function render(status: string): HTMLElement {
  const fixture = TestBed.createComponent(Badge);
  fixture.componentRef.setInput('status', status);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Badge', () => {
  it('renders the In Stock variant with label (AC-02)', () => {
    const span = render('In Stock').querySelector('span.stoqr-badge');
    expect(span?.className).toContain('stoqr-badge--in-stock');
    expect(span?.textContent).toContain('In Stock');
  });

  it('renders the Low Stock variant (AC-03)', () => {
    expect(
      render('Low Stock').querySelector('span.stoqr-badge')?.className,
    ).toContain('stoqr-badge--low-stock');
  });

  it('renders the Out of Stock variant (AC-04)', () => {
    expect(
      render('Out of Stock').querySelector('span.stoqr-badge')?.className,
    ).toContain('stoqr-badge--out-of-stock');
  });

  it('renders the Unknown variant for a blank status (AC-05)', () => {
    const span = render('').querySelector('span.stoqr-badge');
    expect(span?.className).toContain('stoqr-badge--unknown');
    expect(span?.textContent).toContain('Unknown');
  });

  it('always includes a dot element', () => {
    expect(render('In Stock').querySelector('.stoqr-badge__dot')).not.toBeNull();
  });
});
