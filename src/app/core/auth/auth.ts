import { Injectable, inject, signal } from '@angular/core';

import { AppConfig } from '@core/config/app-config';
import { SHEETS_SCOPE } from './auth-scope';
import { GIS_LOADER } from './gis-loader';
import { GisClientError, GisOAuth2, GisTokenClient, GisTokenResponse } from './gis-types';

export type AuthStatus = 'signed-out' | 'signing-in' | 'signed-in';

/** Friendly messages shown to staff. Exported for tests. */
export const AUTH_MESSAGES = {
  denied: "You didn't allow access. Sign in again and approve access to Google Sheets.",
  cancelled: 'Sign-in was cancelled.',
  popupBlocked:
    'Your browser blocked the Google sign-in window. Allow pop-ups for this site, then try again.',
  failed: "Google sign-in didn't complete. Please try again.",
  scriptFailed: "Couldn't reach Google sign-in. Check your connection, then retry.",
  expired: 'Your session expired. Please sign in again.',
} as const;

/** Seconds taken off Google's expiry so a token is never used in its last minute. */
const EXPIRY_MARGIN_SECONDS = 60;

/**
 * Google sign-in with the GIS token flow (US-05). The access token lives in a
 * private field (memory only, never browser storage) and is read only by
 * `core/sheets` through `accessToken()`.
 */
@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly config = inject(AppConfig);
  private readonly loadGis = inject(GIS_LOADER);

  private readonly statusSignal = signal<AuthStatus>('signed-out');
  private readonly errorSignal = signal<string | null>(null);
  private readonly expiresAtSignal = signal<number | null>(null);
  private readonly gisReadySignal = signal(false);

  readonly status = this.statusSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  /** Epoch ms after which the token should be treated as expired (60s margin included). */
  readonly expiresAt = this.expiresAtSignal.asReadonly();
  /** True once the GIS script has loaded and the token client exists. */
  readonly gisReady = this.gisReadySignal.asReadonly();

  private token: string | null = null;
  private oauth2: GisOAuth2 | null = null;
  private client: GisTokenClient | null = null;
  private preparing: Promise<void> | null = null;

  /** Loads GIS and creates the token client. Safe to call repeatedly; Retry calls it again. */
  prepare(): Promise<void> {
    if (this.client !== null) {
      return Promise.resolve();
    }
    this.preparing ??= this.loadGis()
      .then((oauth2) => {
        this.oauth2 = oauth2;
        this.client = oauth2.initTokenClient({
          client_id: this.config.clientId(),
          scope: SHEETS_SCOPE,
          callback: (response) => this.onTokenResponse(response),
          error_callback: (error) => this.onClientError(error),
        });
        this.gisReadySignal.set(true);
        if (this.errorSignal() === AUTH_MESSAGES.scriptFailed) {
          this.errorSignal.set(null);
        }
      })
      .catch(() => {
        this.errorSignal.set(AUTH_MESSAGES.scriptFailed);
      })
      .finally(() => {
        this.preparing = null;
      });
    return this.preparing;
  }

  /**
   * Opens Google's popup. Must run inside the user's click (no await before
   * `requestAccessToken`), or the browser blocks the popup. Ignored while a
   * sign-in is in progress or before GIS is ready.
   */
  signIn(): void {
    if (this.client === null || this.statusSignal() !== 'signed-out') {
      return;
    }
    this.errorSignal.set(null);
    this.statusSignal.set('signing-in');
    this.client.requestAccessToken();
  }

  /** Retry re-runs whichever step failed: loading Google sign-in, or the sign-in itself. */
  retry(): void {
    if (this.client === null) {
      void this.prepare();
    } else {
      this.signIn();
    }
  }

  /** Called by `core/sheets` on HTTP 401: forget the token and ask the user to sign in again. */
  markExpired(): void {
    this.clearSession();
    this.errorSignal.set(AUTH_MESSAGES.expired);
  }

  clearError(): void {
    this.errorSignal.set(null);
  }

  /** The bearer token for Sheets API calls. For `core/sheets` only (architecture rule). */
  accessToken(): string | null {
    return this.token;
  }

  private onTokenResponse(response: GisTokenResponse): void {
    const granted =
      response.error === undefined &&
      response.access_token !== undefined &&
      this.oauth2 !== null &&
      this.oauth2.hasGrantedAllScopes(response, SHEETS_SCOPE);

    if (!granted || response.access_token === undefined) {
      this.clearSession();
      this.errorSignal.set(AUTH_MESSAGES.denied);
      return;
    }

    const lifetimeSeconds = Number(response.expires_in ?? 0);
    this.token = response.access_token;
    this.expiresAtSignal.set(Date.now() + (lifetimeSeconds - EXPIRY_MARGIN_SECONDS) * 1000);
    this.errorSignal.set(null);
    this.statusSignal.set('signed-in');
  }

  private onClientError(error: GisClientError): void {
    this.clearSession();
    this.errorSignal.set(
      error.type === 'popup_closed'
        ? AUTH_MESSAGES.cancelled
        : error.type === 'popup_failed_to_open'
          ? AUTH_MESSAGES.popupBlocked
          : AUTH_MESSAGES.failed,
    );
  }

  private clearSession(): void {
    this.token = null;
    this.expiresAtSignal.set(null);
    this.statusSignal.set('signed-out');
  }
}
