import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdjustMode, Proposal } from '@core/stock-adjust/stock-adjust';
import { StockAdjustStore } from '@core/stock-adjust/stock-adjust-store';
import { StockReviewStore } from '@core/stock-adjust/stock-review-store';
import { StockStatusLabel } from '@core/stock-adjust/stock-status';
import { QuantityAdjuster } from './quantity-adjuster';

describe('QuantityAdjuster', () => {
  const mode = signal<AdjustMode | null>(null);
  const amountText = signal('');
  const proposal = signal<Proposal | null>(null);
  const proposedStatus = signal<StockStatusLabel | null>(null);
  const lowStockWarning = signal(false);
  const readyForReview = signal(false);
  const review = { open: vi.fn() };
  const adjust = {
    mode,
    amountText,
    proposal,
    proposedStatus,
    lowStockWarning,
    readyForReview,
    threshold: signal(100),
    deltaText: computed(() => {
      const p = proposal();
      return p?.ok ? (p.delta < 0 ? `−${-p.delta}` : `+${p.delta}`) : '';
    }),
    setMode: vi.fn((m: AdjustMode) => mode.set(m)),
    setAmount: vi.fn((t: string) => amountText.set(t)),
  };
  let fixture: ComponentFixture<QuantityAdjuster>;
  let el: HTMLElement;

  const button = (label: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label);
  const text = (selector: string) => el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();

  function type(value: string): void {
    const input = el.querySelector<HTMLInputElement>('#adjust-amount');
    if (input === null) {
      throw new Error('amount input not rendered');
    }
    input.value = value;
    input.dispatchEvent(new Event('input'));
    TestBed.tick();
    fixture.detectChanges();
  }

  beforeEach(() => {
    mode.set(null);
    amountText.set('');
    proposal.set(null);
    proposedStatus.set(null);
    lowStockWarning.set(false);
    readyForReview.set(false);
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [QuantityAdjuster],
      providers: [
        { provide: StockAdjustStore, useValue: adjust },
        { provide: StockReviewStore, useValue: review },
      ],
    });
    fixture = TestBed.createComponent(QuantityAdjuster);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('asks for Add or Subtract first; neither is selected', () => {
    expect(text('.adjuster__hint')).toBe('Choose Add or Subtract.');
    expect(button('Add')?.getAttribute('aria-pressed')).toBe('false');
    expect(button('Subtract')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('chooses a mode and sends the typed amount to the store', () => {
    button('Subtract')?.click();
    fixture.detectChanges();
    expect(adjust.setMode).toHaveBeenCalledWith('subtract');
    expect(button('Subtract')?.getAttribute('aria-pressed')).toBe('true');
    type('15');
    expect(adjust.setAmount).toHaveBeenLastCalledWith('15');
  });

  it('shows the live line with the new Stock Status', () => {
    mode.set('subtract');
    proposal.set({ ok: true, current: 120, delta: -15, proposed: 105 });
    proposedStatus.set('In Stock');
    fixture.detectChanges();
    const line = el.querySelector('.adjuster__line');
    const strong = [...(line?.querySelectorAll('strong') ?? [])].map((s) => s.textContent?.trim());
    expect(strong).toEqual(['120', '−15', '105']);
    expect(line?.textContent).toContain('Current');
    expect(line?.textContent).toContain('New');
    expect(line?.querySelector('stoqr-badge')?.textContent).toContain('In Stock');
  });

  it('shows the low-stock warning', () => {
    mode.set('subtract');
    proposal.set({ ok: true, current: 120, delta: -21, proposed: 99 });
    proposedStatus.set('Low Stock');
    lowStockWarning.set(true);
    fixture.detectChanges();
    expect(text('.adjuster__warning')).toBe('Below the low-stock threshold (100).');
  });

  it('shows a blocked proposal’s message, announced to screen readers', () => {
    mode.set('subtract');
    proposal.set({ ok: false, reason: 'below-zero', message: "You can't subtract 15: only 10 in stock." });
    fixture.detectChanges();
    const error = el.querySelector('.adjuster__error');
    expect(error?.textContent?.trim()).toBe("You can't subtract 15: only 10 in stock.");
    expect(error?.getAttribute('role')).toBe('alert');
    expect(el.querySelector('.adjuster__line')).toBeNull();
  });

  it('clears the box when the store resets (another product selected)', () => {
    type('15');
    amountText.set('');
    TestBed.tick();
    fixture.detectChanges();
    expect(el.querySelector<HTMLInputElement>('#adjust-amount')?.value).toBe('');
  });

  it('Review is disabled until the proposal is ready, then opens the review', () => {
    expect(button('Review')?.disabled).toBe(true);
    readyForReview.set(true);
    fixture.detectChanges();
    expect(button('Review')?.disabled).toBe(false);
    button('Review')?.click();
    expect(review.open).toHaveBeenCalledTimes(1);
  });
});
