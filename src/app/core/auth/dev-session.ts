import { isDevMode } from '@angular/core';

import { AppMode } from '@core/config/app-environment';

/**
 * DEVELOPMENT ONLY — REMOVE BEFORE GO-LIVE (US-27 cutover checklist).
 *
 * Keeps the Google session across page reloads while the app is being built,
 * so the owner does not have to sign in after every code change (owner
 * request, 2026-10-31). Active only when BOTH hold: an Angular dev build
 * (`isDevMode()`, false in every production build) and the TEST sheets
 * (`mode === 'test'`). It stores the access token and its expiry in this
 * browser tab's `sessionStorage` (gone when the tab closes) and is cleared on
 * sign-out and expiry; the token still lasts about an hour.
 *
 * This is the only exception to "tokens in memory only" (AI_CONTRACT), and
 * this file is the only place in `core/auth` allowed to touch browser storage.
 */

const KEY = 'stoqr-dev-session';

export interface DevSession {
  readonly token: string;
  /** Epoch ms, margin already applied (as `Auth.expiresAt`). */
  readonly expiresAt: number;
  readonly firstName: string | null;
  readonly accountId: string | null;
}

export function devSessionEnabled(mode: AppMode): boolean {
  return isDevMode() && mode === 'test';
}

/** The saved session if it is still valid; an expired or unreadable one is removed. */
export function loadDevSession(): DevSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) {
      return null;
    }
    const saved = JSON.parse(raw) as Partial<DevSession>;
    if (typeof saved.token !== 'string' || typeof saved.expiresAt !== 'number' || saved.expiresAt <= Date.now()) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return {
      token: saved.token,
      expiresAt: saved.expiresAt,
      firstName: typeof saved.firstName === 'string' ? saved.firstName : null,
      accountId: typeof saved.accountId === 'string' ? saved.accountId : null,
    };
  } catch {
    return null;
  }
}

export function saveDevSession(session: DevSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Storage blocked: the app simply asks for sign-in after a reload.
  }
}

export function clearDevSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
