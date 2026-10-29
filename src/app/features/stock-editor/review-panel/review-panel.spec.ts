import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReviewStep, ReviewSummary, StockReviewStore } from '@core/stock-adjust/stock-review-store';
import { ReviewPanel } from './review-panel';

describe('ReviewPanel', () => {
  const summary: ReviewSummary = {
    productName: 'Pulse Oximeter',
    sheetsText: 'Master and Dr Trust',
    current: 10,
    deltaText: '−3',
    proposed: 7,
    status: 'In Stock',
    lowStockWarning: false,
    drTrustNote: null,
  };
  const step = signal<ReviewStep>('reviewing');
  const review = signal<ReviewSummary | null>(summary);
  const message = signal<string | null>(null);
  const store = {
    step,
    review,
    message,
    approve: vi.fn(() => Promise.resolve()),
    back: vi.fn(),
    open: vi.fn(),
  };
  let fixture: ComponentFixture<ReviewPanel>;
  let el: HTMLElement;

  const labels = () => [...el.querySelectorAll('button')].map((b) => b.textContent?.trim());
  const button = (label: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label);

  function show(s: ReviewStep, text: string | null = null): void {
    step.set(s);
    message.set(text);
    fixture.detectChanges();
  }

  beforeEach(() => {
    step.set('reviewing');
    review.set(summary);
    message.set(null);
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [ReviewPanel],
      providers: [{ provide: StockReviewStore, useValue: store }],
    });
    fixture = TestBed.createComponent(ReviewPanel);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('shows where it saves and the change, with the new status', () => {
    expect(el.querySelector('.review__sheets')?.textContent).toContain('Master and Dr Trust');
    const line = el.querySelector('.review__line');
    const strong = [...(line?.querySelectorAll('strong') ?? [])].map((s) => s.textContent?.trim());
    expect(strong).toEqual(['10', '−3', '7']);
    expect(line?.querySelector('stoqr-badge')?.textContent).toContain('In Stock');
    expect(el.querySelector('.review__warning')).toBeNull();
    expect(el.querySelector('.review__note')).toBeNull();
  });

  it('shows the low-stock warning and the Dr Trust overwrite note (US-35)', () => {
    review.set({ ...summary, lowStockWarning: true, drTrustNote: 'Dr Trust currently has 4; it will be set to 7.' });
    fixture.detectChanges();
    expect(el.querySelector('.review__warning')?.textContent?.trim()).toBe('Below the low-stock threshold.');
    expect(el.querySelector('.review__note')?.textContent?.trim()).toBe('Dr Trust currently has 4; it will be set to 7.');
  });

  it('Approve and Back call the store', () => {
    expect(labels()).toEqual(['Approve', 'Back']);
    button('Approve')?.click();
    button('Back')?.click();
    expect(store.approve).toHaveBeenCalledTimes(1);
    expect(store.back).toHaveBeenCalledTimes(1);
  });

  it('while saving, shows one disabled Saving… button', () => {
    show('saving');
    expect(labels()).toEqual(['Saving…']);
    expect(button('Saving…')?.disabled).toBe(true);
  });

  it('a conflict shows the message and offers Review again', () => {
    show('conflict', 'The stock changed to 12 since you reviewed. Nothing was saved.');
    expect(el.querySelector('.review__message')?.textContent?.trim()).toBe(
      'The stock changed to 12 since you reviewed. Nothing was saved.',
    );
    expect(el.querySelector('.review__message')?.getAttribute('role')).toBe('alert');
    button('Review again')?.click();
    expect(store.open).toHaveBeenCalledTimes(1);
  });

  it('a failure offers Try again', () => {
    show('failed', "Couldn't save to Master.");
    expect(labels()).toEqual(['Try again', 'Back']);
    button('Try again')?.click();
    expect(store.approve).toHaveBeenCalledTimes(1);
  });

  it('a partial save shows the message even without a valid proposal, and only Close', () => {
    review.set(null);
    show('partial', 'Master was updated to 7. Dr Trust was not updated: no access.');
    expect(el.querySelector('.review__line')).toBeNull();
    expect(el.querySelector('.review__message')?.textContent).toContain('Dr Trust was not updated');
    expect(labels()).toEqual(['Close']);
    button('Close')?.click();
    expect(store.back).toHaveBeenCalledTimes(1);
  });
});
