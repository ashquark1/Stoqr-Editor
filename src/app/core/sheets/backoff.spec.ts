import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';

import { MAX_RETRY_AFTER_MS, RETRY_DELAYS_MS, isBusy, isTransient, retryDelay } from './backoff';

const httpError = (status: number, headers: Record<string, string> = {}) =>
  new HttpErrorResponse({ status, headers: new HttpHeaders(headers) });

describe('backoff (US-11)', () => {
  it('waits about 1 s, 2 s, then 4 s', () => {
    expect(RETRY_DELAYS_MS).toEqual([1000, 2000, 4000]);
    const middle = () => 0.5;
    expect([0, 1, 2].map((attempt) => retryDelay(attempt, httpError(503), middle))).toEqual([1000, 2000, 4000]);
  });

  it('spreads each wait by at most ±20%', () => {
    expect(retryDelay(1, httpError(503), () => 0)).toBe(1600);
    expect(retryDelay(1, httpError(503), () => 1)).toBe(2400);
  });

  it('honours Retry-After in seconds, capped at 30 s', () => {
    expect(retryDelay(0, httpError(429, { 'Retry-After': '5' }))).toBe(5000);
    expect(retryDelay(0, httpError(429, { 'Retry-After': '120' }))).toBe(MAX_RETRY_AFTER_MS);
  });

  it('ignores a Retry-After that is not whole seconds (e.g. a date)', () => {
    const dated = httpError(429, { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' });
    expect(retryDelay(0, dated, () => 0.5)).toBe(1000);
  });

  it.each([
    [429, true, true],
    [500, true, false],
    [503, true, false],
    [0, true, false],
    [400, false, false],
    [401, false, false],
    [403, false, false],
    [404, false, false],
  ])('HTTP %i: transient %s, busy %s', (status, transient, busy) => {
    expect(isTransient(httpError(status))).toBe(transient);
    expect(isBusy(httpError(status))).toBe(busy);
  });

  it('a non-HTTP error is neither', () => {
    expect(isTransient(new Error('x'))).toBe(false);
    expect(isBusy(new Error('x'))).toBe(false);
  });
});
