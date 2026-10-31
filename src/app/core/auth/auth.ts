import { Injectable, computed, inject, signal } from '@angular/core';

import { AppConfig } from '@core/config/app-config';
import { REQUESTED_SCOPES, SHEETS_SCOPE } from './auth-scope';
import { clearDevSession, devSessionEnabled, loadDevSession, saveDevSession } from './dev-session';
import { GIS_LOADER } from './gis-loader';
import { GisClientError, GisOAuth2, GisTokenClient, GisTokenResponse } from './gis-types';
import {
  clearRecord,
  hasValidRecord,
  saveRecord,
  silentAttempted,
  silentSignInUrl,
  takeSilentResult,
} from './remember-me';
import { UserProfile, UserProfileReader } from './user-profile';

/**
 * `expired`: the token is gone but the session (data, search, work) is kept
 * until the user renews or signs out. `renewing`: Continue was clicked and
 * Google's popup is open (US-06).
 */
export type AuthStatus = 'signed-out' | 'signing-in' | 'signed-in' | 'expired' | 'renewing';

/** Friendly messages shown to staff. Exported for tests. */
export const AUTH_MESSAGES = {
  denied: "You didn't allow access. Sign in again and approve access to Google Sheets.",
  cancelled:
    'Sign-in was cancelled. If Google said access is blocked, ask the owner to add your account as a test user.',
  popupBlocked:
    'Your browser blocked the Google sign-in window. Allow pop-ups for this site, then try again.',
  failed: "Google sign-in didn't complete. Please try again.",
  scriptFailed: "Couldn't reach Google sign-in. Check your connection, then retry.",
  expired: 'Your session expired. Please sign in again.',
  renewCancelled: 'Renewal was cancelled. Continue to keep working.',
} as const;

/** Seconds taken off Google's expiry so a token is never used in its last minute. */
const EXPIRY_MARGIN_SECONDS = 60;

/** How long before expiry the "session ends soon" warning appears. */
export const EXPIRY_WARNING_MS = 5 * 60 * 1000;

/** Topbar label when the first name is unknown (profile not granted or lookup failed). */
export const SIGNED_IN_LABEL = 'Signed in';

/** Thrown by `freshToken()` when the session ends (sign-out) instead of being renewed. */
export class SessionEndedError extends Error {
  constructor() {
    super('The session ended before a token was available.');
    this.name = 'SessionEndedError';
  }
}

interface TokenWaiter {
  readonly resolve: (token: string) => void;
  readonly reject: (error: SessionEndedError) => void;
}

/**
 * Google sign-in with the GIS token flow (US-05), sign-out and the first name
 * (US-07, D1), in-place renewal (US-06), and Remember me (US-67, US-68): a
 * ticked sign-in keeps a record (`remember-me.ts`, flag + time only), and on a
 * later visit a silent redirect (`prompt=none`) brings a token back with no
 * click. The access token lives in a private field (memory only, never
 * browser storage — except the development-only session keeper in
 * `dev-session.ts`, removed before go-live); `core/sheets` gets it
 * only through `freshToken()`. Expiry never clears work: only sign-out, or a
 * different account on renewal, starts a new `sessionId`.
 */
@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly config = inject(AppConfig);
  private readonly loadGis = inject(GIS_LOADER);
  private readonly profiles = inject(UserProfileReader);

  private readonly statusSignal = signal<AuthStatus>('signed-out');
  private readonly errorSignal = signal<string | null>(null);
  private readonly renewalErrorSignal = signal<string | null>(null);
  private readonly expiresAtSignal = signal<number | null>(null);
  private readonly expiringSoonSignal = signal(false);
  private readonly gisReadySignal = signal(false);
  private readonly firstNameSignal = signal<string | null>(null);
  private readonly sessionIdSignal = signal(0);
  /** Where a renewal started: the dialog (`expired`) or the early warning (`signed-in`). */
  private readonly renewOriginSignal = signal<'signed-in' | 'expired'>('expired');
  private readonly redirectingSignal = signal(false);

  readonly status = this.statusSignal.asReadonly();
  /** A silent sign-in is leaving for Google (US-68): the sign-in screen shows "Signing you in…". */
  readonly redirecting = this.redirectingSignal.asReadonly();
  /** Sign-in screen message, or null. */
  readonly error = this.errorSignal.asReadonly();
  /** Message inside the "Session expired" dialog after a failed renewal, or null. */
  readonly renewalError = this.renewalErrorSignal.asReadonly();
  /** Epoch ms after which the token should be treated as expired (60s margin included). */
  readonly expiresAt = this.expiresAtSignal.asReadonly();
  /** True once the GIS script has loaded and the token client exists. */
  readonly gisReady = this.gisReadySignal.asReadonly();
  /** The signed-in person's first name, or null until (or unless) Google returns it. */
  readonly firstName = this.firstNameSignal.asReadonly();
  /** What the topbar shows: the first name, else "Signed in". */
  readonly userLabel = computed(() => this.firstNameSignal() ?? SIGNED_IN_LABEL);
  /**
   * Changes on a sign-in from signed out, on sign-out, and when renewal brings
   * a different account — never on expiry or a same-account renewal. Stores
   * that hold work reset when it changes.
   */
  readonly sessionId = this.sessionIdSignal.asReadonly();
  /** Someone is using the app: signed in, or expired/renewing with their work kept. */
  readonly hasSession = computed(() => {
    const status = this.statusSignal();
    return status === 'signed-in' || status === 'expired' || status === 'renewing';
  });
  /** Show the "session ends in 5 minutes" warning. */
  readonly expiryWarning = computed(
    () => this.expiringSoonSignal() && this.statusSignal() === 'signed-in',
  );
  /** Show the blocking "Session expired" dialog. */
  readonly expiredDialogOpen = computed(() => {
    const status = this.statusSignal();
    return (
      status === 'expired' || (status === 'renewing' && this.renewOriginSignal() === 'expired')
    );
  });

  private token: string | null = null;
  private accountId: string | null = null;
  private oauth2: GisOAuth2 | null = null;
  private client: GisTokenClient | null = null;
  private preparing: Promise<void> | null = null;
  private waiters: TokenWaiter[] = [];
  /** True from `renew()` until Google answers; the status alone cannot tell (a 401 may land meanwhile). */
  private renewInFlight = false;
  private warningTimer: ReturnType<typeof setTimeout> | undefined;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped whenever a token is replaced or dropped, so a late profile lookup is discarded. */
  private tokenGeneration = 0;
  /** The last Remember me choice (US-67); Retry reuses it. */
  private remember = true;
  /** DEVELOPMENT ONLY (dev-session.ts): keep the session across reloads. Remove before go-live. */
  private readonly keepDevSession = devSessionEnabled(this.config.mode());

  constructor() {
    // DEVELOPMENT ONLY: a reload in a dev build on the TEST sheets resumes the
    // saved session instead of asking for sign-in again (dev-session.ts).
    const saved = this.keepDevSession ? loadDevSession() : null;
    if (saved !== null) {
      this.startToken(saved.token, saved.expiresAt);
      this.accountId = saved.accountId;
      this.firstNameSignal.set(saved.firstName);
      this.statusSignal.set('signed-in');
      this.sessionIdSignal.update((id) => id + 1);
      return;
    }
    // Back from a silent sign-in (US-68): take the token from the URL (removed
    // at once). Any failure is quiet: the normal sign-in screen, no error.
    const result = takeSilentResult();
    if (result?.kind === 'token' && result.scope.split(' ').includes(SHEETS_SCOPE)) {
      this.setToken(result.token, result.expiresIn);
      this.statusSignal.set('signed-in');
      this.sessionIdSignal.update((id) => id + 1);
      saveRecord(); // another 30 days from this sign-in
      void this.loadProfile(result.token, false);
    }
  }

  /**
   * The Google address for a silent sign-in (US-68), or null when there is
   * nothing to try: already signed in, no valid Remember-me record, or an
   * attempt already ran in this tab. The caller (`provideAuthRedirects`)
   * navigates there.
   */
  silentSignInUrl(): string | null {
    if (this.statusSignal() !== 'signed-out' || !hasValidRecord() || silentAttempted()) {
      return null;
    }
    const url = silentSignInUrl(
      this.config.clientId(),
      REQUESTED_SCOPES,
      `${window.location.origin}/`,
    );
    if (url !== null) {
      this.redirectingSignal.set(true);
    }
    return url;
  }

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
          scope: REQUESTED_SCOPES,
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
  signIn(remember = this.remember): void {
    if (this.client === null || this.statusSignal() !== 'signed-out') {
      return;
    }
    this.remember = remember;
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

  /**
   * Renews the session in place (US-06), from a click on Continue (expired) or
   * Stay signed in (the early warning). `prompt: ''` lets Google skip the
   * account chooser and consent when nothing changed. Ignored otherwise.
   */
  renew(): void {
    const status = this.statusSignal();
    const fromWarning = status === 'signed-in' && this.expiringSoonSignal();
    if (this.client === null || (status !== 'expired' && !fromWarning)) {
      return;
    }
    this.renewOriginSignal.set(fromWarning ? 'signed-in' : 'expired');
    this.renewalErrorSignal.set(null);
    this.renewInFlight = true;
    this.statusSignal.set('renewing');
    this.client.requestAccessToken({ prompt: '' });
  }

  /** Hides the early warning until the next token (the dialog still appears at expiry). */
  dismissExpiryWarning(): void {
    this.expiringSoonSignal.set(false);
  }

  /**
   * Signs out (US-07): revokes the token with Google (not awaited, so a slow or
   * failing revoke never keeps anyone signed in), then ends the session. Waiting
   * requests are rejected; the redirects return to `/sign-in`.
   */
  signOut(): void {
    clearRecord(); // Remember me ends with Sign out (US-67)
    const token = this.token;
    if (token !== null && this.oauth2 !== null) {
      try {
        this.oauth2.revoke(token);
      } catch {
        // Best effort: the local sign-out below always happens.
      }
    }
    this.endSession();
    this.errorSignal.set(null);
  }

  /**
   * The token has expired (clock, `expiresAt` passed, or HTTP 401). Forgets
   * ONLY the token; data, search, work and the name are kept, and the
   * "Session expired" dialog asks the user to Continue (US-06).
   */
  markExpired(): void {
    const status = this.statusSignal();
    if (status !== 'signed-in' && status !== 'renewing') {
      return;
    }
    this.dropToken();
    if (this.renewInFlight) {
      // A renewal started from the warning is still open: keep waiting for it,
      // but show the dialog if it fails, since the token is now gone.
      this.renewOriginSignal.set('expired');
      return;
    }
    this.statusSignal.set('expired');
  }

  clearError(): void {
    this.errorSignal.set(null);
  }

  /**
   * A valid bearer token for Sheets API calls; for `core/sheets` only
   * (architecture rule). Resolves at once when the token is valid; otherwise
   * the session expires (if it has not already) and this waits until the user
   * renews. Rejects with `SessionEndedError` when the session ends instead.
   */
  freshToken(): Promise<string> {
    const expiresAt = this.expiresAtSignal();
    if (this.token !== null && (expiresAt === null || Date.now() < expiresAt)) {
      return Promise.resolve(this.token);
    }
    this.markExpired();
    const status = this.statusSignal();
    if (status !== 'expired' && status !== 'renewing') {
      return Promise.reject(new SessionEndedError());
    }
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  private onTokenResponse(response: GisTokenResponse): void {
    const renewing = this.renewInFlight;
    this.renewInFlight = false;
    const granted =
      response.error === undefined &&
      response.access_token !== undefined &&
      this.oauth2 !== null &&
      this.oauth2.hasGrantedAllScopes(response, SHEETS_SCOPE);

    if (!granted || response.access_token === undefined) {
      // Refused (or Sheets unticked): no access any more, so the session ends.
      this.endSession();
      this.errorSignal.set(AUTH_MESSAGES.denied);
      return;
    }

    this.setToken(response.access_token, Number(response.expires_in ?? 0));
    this.errorSignal.set(null);
    this.renewalErrorSignal.set(null);
    this.statusSignal.set('signed-in');

    if (renewing) {
      const waiters = this.waiters;
      this.waiters = [];
      waiters.forEach((w) => w.resolve(response.access_token ?? ''));
    } else {
      this.sessionIdSignal.update((id) => id + 1);
      // Ticked: keep (or renew) the record for 30 days; unticked: delete any record (US-67).
      if (this.remember) {
        saveRecord();
      } else {
        clearRecord();
      }
    }
    void this.loadProfile(response.access_token, renewing);
  }

  /**
   * Background lookup of who signed in. After a renewal, a different person
   * (account id, else first name) starts a new session so one person's work
   * never carries into another's.
   */
  private async loadProfile(token: string, renewal: boolean): Promise<void> {
    const generation = this.tokenGeneration;
    const profile = await this.profiles.profile(token);
    if (generation !== this.tokenGeneration) {
      return;
    }
    if (renewal && this.isDifferentPerson(profile)) {
      this.sessionIdSignal.update((id) => id + 1);
    }
    this.accountId = profile?.id ?? null;
    this.firstNameSignal.set(profile?.firstName ?? null);
    this.saveDevSession();
  }

  private isDifferentPerson(profile: UserProfile | null): boolean {
    if (profile === null) {
      return false;
    }
    if (this.accountId !== null && profile.id !== null) {
      return this.accountId !== profile.id;
    }
    // Weaker fallback when Google gives no account id: compare first names.
    const before = this.firstNameSignal();
    return before !== null && profile.firstName !== null && before !== profile.firstName;
  }

  private onClientError(error: GisClientError): void {
    const message =
      error.type === 'popup_closed'
        ? AUTH_MESSAGES.cancelled
        : error.type === 'popup_failed_to_open'
          ? AUTH_MESSAGES.popupBlocked
          : AUTH_MESSAGES.failed;

    if (this.renewInFlight) {
      this.renewInFlight = false;
      // The work is still there: go back to where the renewal started.
      const origin = this.renewOriginSignal();
      this.statusSignal.set(
        origin === 'signed-in' && this.token !== null ? 'signed-in' : 'expired',
      );
      this.renewalErrorSignal.set(
        error.type === 'popup_closed' ? AUTH_MESSAGES.renewCancelled : message,
      );
      return;
    }
    this.statusSignal.set('signed-out');
    this.errorSignal.set(message);
  }

  private setToken(token: string, lifetimeSeconds: number): void {
    this.startToken(token, Date.now() + (lifetimeSeconds - EXPIRY_MARGIN_SECONDS) * 1000);
    this.saveDevSession();
  }

  /** Holds a token until `expiresAt` (margin applied) and starts the session clock. */
  private startToken(token: string, expiresAt: number): void {
    this.clearTimers();
    this.tokenGeneration++;
    this.token = token;
    this.expiresAtSignal.set(expiresAt);
    this.expiringSoonSignal.set(false);

    const untilWarning = expiresAt - EXPIRY_WARNING_MS - Date.now();
    if (untilWarning > 0) {
      this.warningTimer = setTimeout(() => this.expiringSoonSignal.set(true), untilWarning);
    } else {
      this.expiringSoonSignal.set(true);
    }
    this.expiryTimer = setTimeout(() => this.markExpired(), Math.max(0, expiresAt - Date.now()));
  }

  private dropToken(): void {
    this.clearTimers();
    this.tokenGeneration++;
    this.token = null;
    this.expiresAtSignal.set(null);
    this.expiringSoonSignal.set(false);
    if (this.keepDevSession) {
      clearDevSession();
    }
  }

  /** DEVELOPMENT ONLY (dev-session.ts): remember the current token for the next reload. */
  private saveDevSession(): void {
    const expiresAt = this.expiresAtSignal();
    if (!this.keepDevSession || this.token === null || expiresAt === null) {
      return;
    }
    saveDevSession({
      token: this.token,
      expiresAt,
      firstName: this.firstNameSignal(),
      accountId: this.accountId,
    });
  }

  /** Sign-out (or refused access): forget everyone and everything; reject waiting requests. */
  private endSession(): void {
    const hadSession = this.hasSession();
    this.renewInFlight = false;
    this.dropToken();
    this.accountId = null;
    this.firstNameSignal.set(null);
    this.renewalErrorSignal.set(null);
    this.statusSignal.set('signed-out');
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((w) => w.reject(new SessionEndedError()));
    if (hadSession) {
      this.sessionIdSignal.update((id) => id + 1);
    }
  }

  private clearTimers(): void {
    clearTimeout(this.warningTimer);
    clearTimeout(this.expiryTimer);
    this.warningTimer = undefined;
    this.expiryTimer = undefined;
  }
}
