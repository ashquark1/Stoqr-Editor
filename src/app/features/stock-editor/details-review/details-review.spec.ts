import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetailsReview as Review, DetailsReviewStore } from '@core/details/details-review-store';
import { ReviewStep } from '@core/sheets/review-flow';
import { DetailsReview } from './details-review';

describe('DetailsReview (US-23)', () => {
  const step = signal<ReviewStep>('reviewing');
  const message = signal<string | null>(null);
  const retryLabel = signal<string | null>(null);
  const review = signal<Review | null>({
    sheetsText: 'Master and Dr Trust',
    drTrustLabel: 'Dr Trust',
    lines: [
      { field: 'brand', label: 'Brand', from: 'Dr Trust', to: 'Dr. Trust', drTrustFrom: 'DrTrust' },
      { field: 'mrp', label: 'MRP', from: 2999, to: null },
    ],
    statuses: [{ sheet: 'master', sheetLabel: 'Master', from: 'In Stock', to: 'Low Stock' }],
  });
  const store = { step, message, retryLabel, review, approve: vi.fn(), back: vi.fn(), open: vi.fn(), retry: vi.fn() };
  let fixture: ComponentFixture<DetailsReview>;
  let el: HTMLElement;

  const button = (text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);
  /** Each line's text with whitespace removed (layout spacing is CSS, not text). */
  const lines = () => [...el.querySelectorAll('.dreview__line')].map((l) => l.textContent?.replace(/\s+/g, ''));
  const squash = (text: string) => text.replace(/\s+/g, '');

  beforeEach(() => {
    step.set('reviewing');
    message.set(null);
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [DetailsReview],
      providers: [{ provide: DetailsReviewStore, useValue: store }],
    });
    fixture = TestBed.createComponent(DetailsReview);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('lists only the changed fields old → new, the sheets, Dr Trust where it differs, and status changes', () => {
    expect(el.querySelector('.dreview__sheets')?.textContent).toContain('Master and Dr Trust');
    expect(lines()).toEqual([
      squash('Brand Dr Trust → Dr. Trust Dr Trust has DrTrust; it will be set to Dr. Trust.'),
      squash('MRP 2999 → empty'),
      squash('Stock Status (Master) In Stock → Low Stock'),
    ]);
  });

  it('Approve and Back go to the store', () => {
    button('Approve')?.click();
    button('Back')?.click();
    expect(store.approve).toHaveBeenCalledTimes(1);
    expect(store.back).toHaveBeenCalledTimes(1);
  });

  it('a partial save shows the message and Retry for the sheet behind', () => {
    step.set('partial');
    message.set('Master was updated. Dr Trust was not updated: no access.');
    retryLabel.set('Dr Trust');
    fixture.detectChanges();
    expect(el.querySelector('.dreview__message')?.textContent?.trim()).toBe(
      'Master was updated. Dr Trust was not updated: no access.',
    );
    button('Retry Dr Trust')?.click();
    expect(store.retry).toHaveBeenCalledTimes(1);
  });
});
