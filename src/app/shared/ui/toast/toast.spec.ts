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

  it('auto-dismisses after the timeout (AC-04)', () => {
    const fixture = create();
    let dismissed = false;
    fixture.componentInstance.dismiss.subscribe(() => (dismissed = true));
    fixture.detectChanges(); // ngOnInit schedules the timer
    vi.advanceTimersByTime(5000);
    expect(dismissed).toBe(true);
  });
});
