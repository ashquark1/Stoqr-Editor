import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Logo } from './logo';

describe('Logo', () => {
  it('renders the hero lockup by default (mark + wordmark + sub-label)', () => {
    const fixture = TestBed.createComponent(Logo);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const logo = el.querySelector('.stoqr-logo');
    expect(logo?.classList.contains('stoqr-logo--inline')).toBe(false);
    expect(el.querySelector('.stoqr-logo__mark')).not.toBeNull();
    expect(el.querySelector('.stoqr-logo__wordmark')?.textContent).toContain('stoqr');
    expect(el.querySelector('.stoqr-logo__sub')).not.toBeNull();
  });

  it('uses the inline lockup when inline=true', () => {
    const fixture = TestBed.createComponent(Logo);
    fixture.componentRef.setInput('inline', true);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.stoqr-logo')?.classList.contains('stoqr-logo--inline')).toBe(true);
  });
});
