import { HttpErrorResponse } from '@angular/common/http';
import { InjectionToken } from '@angular/core';

/** Waits before each automatic retry (US-11): up to 3 retries per request. */
export const RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000];

/** A `Retry-After` from Google is honoured up to this. */
export const MAX_RETRY_AFTER_MS = 30_000;

/** ±20% random spread, so two tabs do not retry in step. */
const JITTER = 0.2;

/** How the app waits between retries; a timer by default, instant in tests. */
export const RETRY_WAIT = new InjectionToken<(ms: number) => Promise<void>>('RETRY_WAIT', {
  providedIn: 'root',
  factory: () => (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
});

/** Google refused for quota (429): nothing was done, so retrying is safe. */
export function isBusy(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 429;
}

/** Busy, a Google outage (5xx) or no network (status 0): may pass on its own. */
export function isTransient(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status === 0 || error.status === 429 || error.status >= 500);
}

/** The wait before retry number `attempt` (0-based): `Retry-After` seconds if given, else the backoff step. */
export function retryDelay(attempt: number, error: unknown, random: () => number = Math.random): number {
  const after = retryAfterMs(error);
  if (after !== null) {
    return after;
  }
  const base = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
  return Math.round(base * (1 - JITTER + 2 * JITTER * random()));
}

function retryAfterMs(error: unknown): number | null {
  const raw = error instanceof HttpErrorResponse ? error.headers.get('Retry-After')?.trim() : undefined;
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return null;
  }
  return Math.min(Number(raw) * 1000, MAX_RETRY_AFTER_MS);
}
