import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toast } from './toast';

function create(message = 'Network down') {
  const fixture = TestBed.createComponent(Toast);
  fixture.componentRef.setInput('message', message);
  return fixture;
}

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders the title, message, and a Retry button', () => {
    const fixture = create('Network down');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain("Couldn't load products");
    expect(el.textContent).toContain('Network down');
    expect(el.querySelector('.stoqr-toast__retry')).not.toBeNull();
  });

  it('emits retry when Retry is clicked', () => {
    const fixture = create();
    let retried = false;
    fixture.componentInstance.retry.subscribe(() => (retried = true));
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.stoqr-toast__retry').click();
    expect(retried).toBe(true);
  });

  it('emits dismiss when the close button is clicked', () => {
    const fixture = create();
    let dismissed = false;
    fixture.componentInstance.dismiss.subscribe(() => (dismissed = true));
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.toast-close').click();
    expect(dismissed).toBe(true);
  });

  it('defaults to the error variant, announced assertively', () => {
    const fixture = create();
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('.stoqr-toast');
    expect(card.classList).toContain('stoqr-toast--error');
    expect(card.getAttribute('role')).toBe('alert');
  });

  it('supports a warning variant with its own action label (US-06)', () => {
    const fixture = create('Stay signed in to keep working.');
    fixture.componentRef.setInput('variant', 'warning');
    fixture.componentRef.setInput('actionLabel', 'Stay signed in');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const card = el.querySelector('.stoqr-toast');
    expect(card?.classList).toContain('stoqr-toast--warning');
    expect(card?.getAttribute('role')).toBe('status');
    expect(el.querySelector('.stoqr-toast__retry')?.textContent?.trim()).toBe('Stay signed in');
  });

  it('supports a success variant with no action button (US-20)', () => {
    const fixture = create('Pulse Oximeter is now 7 (Master).');
    fixture.componentRef.setInput('variant', 'success');
    fixture.componentRef.setInput('actionLabel', '');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const card = el.querySelector('.stoqr-toast');
    expect(card?.classList).toContain('stoqr-toast--success');
    expect(card?.getAttribute('role')).toBe('status');
    expect(el.querySelector('.stoqr-toast__retry')).toBeNull();
    expect(el.querySelector('.toast-close')).not.toBeNull();
  });

  it('never auto-dismisses when autoDismissMs is 0', () => {
    const fixture = create();
    fixture.componentRef.setInput('autoDismissMs', 0);
    let dismissed = false;
    fixture.componentInstance.dismiss.subscribe(() => (dismissed = true));
    fixture.detectChanges();
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(dismissed).toBe(false);
  });

  it('auto-dismisses after the timeout (AC-04)', () => {
    const fixture = create();
    let dismissed = false;
    fixture.componentInstance.dismiss.subscribe(() => (dismissed = true));
    fixture.detectChanges(); // ngOnInit schedules the timer
    vi.advanceTimersByTime(5000);
    expect(dismissed).toBe(true);
  });
});
