import { isSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AppConfig } from '@core/config/app-config';
import { AUTH_MESSAGES, Auth, EXPIRY_WARNING_MS, SIGNED_IN_LABEL, SessionEndedError } from './auth';
import { PROFILE_SCOPE, REQUESTED_SCOPES, SHEETS_SCOPE } from './auth-scope';
import { GIS_LOADER, GisLoader } from './gis-loader';
import { FakeGis } from './testing/fake-gis';
import { UserProfile, UserProfileReader } from './user-profile';

const TOKEN = 'fake-access-token';
const RENEWED = 'renewed-access-token';
const LIFETIME_S = 3599;
/** Lifetime minus the 60 s safety margin, in ms. */
const SESSION_MS = (LIFETIME_S - 60) * 1000;

describe('Auth', () => {
  let gis: FakeGis;
  let auth: Auth;
  /** What the fake profile lookup resolves with; tests may replace it. */
  let lookup: (token: string) => Promise<UserProfile | null>;
  const profile = vi.fn((token: string) => lookup(token));

  function setup(loader?: GisLoader): void {
    gis = new FakeGis();
    lookup = () => Promise.resolve({ id: 'acct-1', firstName: 'Ashutosh' });
    profile.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: GIS_LOADER, useValue: loader ?? (() => Promise.resolve(gis)) },
        { provide: UserProfileReader, useValue: { profile } },
      ],
    });
    auth = TestBed.inject(Auth);
  }

  /** Lets background promises (profile lookups, waiters) settle; works with fake timers too. */
  const settle = async () => {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
  };

  async function signedIn(token = TOKEN): Promise<void> {
    await auth.prepare();
    auth.signIn();
    gis.respond({ access_token: token, expires_in: LIFETIME_S, scope: SHEETS_SCOPE });
    await settle();
  }

  /** Answers an open renewal popup with a new token. */
  async function renewed(token = RENEWED): Promise<void> {
    gis.respond({ access_token: token, expires_in: LIFETIME_S, scope: SHEETS_SCOPE });
    await settle();
  }

  afterEach(() => vi.useRealTimers());

  describe('rules', () => {
    beforeEach(() => setup());

    it('requests exactly the approved scopes (Sheets + profile, D1) with the configured Client ID', async () => {
      await auth.prepare();
      expect(REQUESTED_SCOPES.split(' ')).toEqual([SHEETS_SCOPE, PROFILE_SCOPE]);
      expect(gis.config?.scope).toBe(REQUESTED_SCOPES);
      expect(gis.config?.client_id).toBe(TestBed.inject(AppConfig).clientId());
    });

    it('requires only the Sheets scope to be granted (profile is optional)', async () => {
      await signedIn();
      expect(gis.checkedScopes).toEqual([[SHEETS_SCOPE]]);
    });

    it('never writes the token to browser storage or cookies', async () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const cookiesBefore = document.cookie;
      await signedIn();
      auth.markExpired();
      auth.renew();
      await renewed();
      expect(setItem).not.toHaveBeenCalled();
      expect(document.cookie).toBe(cookiesBefore);
      setItem.mockRestore();
    });

    it('does not expose the token through any public signal', async () => {
      await signedIn();
      const signalValues = Object.values(auth)
        .filter(isSignal)
        .map((s) => s());
      expect(signalValues).not.toContain(TOKEN);
      await expect(auth.freshToken()).resolves.toBe(TOKEN);
    });

    it('sign-out always ends signed out, even when revoke throws', async () => {
      await signedIn();
      gis.revokeThrows = true;
      auth.signOut();
      expect(auth.status()).toBe('signed-out');
      await expect(auth.freshToken()).rejects.toBeInstanceOf(SessionEndedError);
    });

    it('expiry never clears the name or the session id (work is kept, US-06)', async () => {
      await signedIn();
      const session = auth.sessionId();
      auth.markExpired();
      expect(auth.status()).toBe('expired');
      expect(auth.hasSession()).toBe(true);
      expect(auth.firstName()).toBe('Ashutosh');
      expect(auth.sessionId()).toBe(session);
    });

    it('only sign-out (or another account) starts a new session id', async () => {
      const before = auth.sessionId();
      await signedIn();
      const afterSignIn = auth.sessionId();
      expect(afterSignIn).toBe(before + 1);

      auth.markExpired();
      auth.renew();
      await renewed();
      expect(auth.sessionId()).toBe(afterSignIn);

      auth.signOut();
      expect(auth.sessionId()).toBe(afterSignIn + 1);
    });

    it('a request waiting on renewal resumes with the new token', async () => {
      await signedIn();
      auth.markExpired();
      const first = auth.freshToken();
      const second = auth.freshToken();
      auth.renew();
      await renewed();
      await expect(first).resolves.toBe(RENEWED);
      await expect(second).resolves.toBe(RENEWED);
    });

    it('waiting requests are rejected when the user signs out instead', async () => {
      await signedIn();
      auth.markExpired();
      const waiting = auth.freshToken();
      auth.signOut();
      await expect(waiting).rejects.toBeInstanceOf(SessionEndedError);
    });

    it('a different account on renewal starts a new session', async () => {
      await signedIn();
      const session = auth.sessionId();
      auth.markExpired();
      lookup = () => Promise.resolve({ id: 'acct-2', firstName: 'Priya' });
      auth.renew();
      await renewed();
      expect(auth.status()).toBe('signed-in');
      expect(auth.sessionId()).toBe(session + 1);
      expect(auth.firstName()).toBe('Priya');
    });
  });

  describe('sign-in flow', () => {
    beforeEach(() => setup());

    it('stays signed out and ignores clicks until Google sign-in has loaded', () => {
      expect(auth.gisReady()).toBe(false);
      auth.signIn();
      expect(auth.status()).toBe('signed-out');
      expect(gis.requests).toBe(0);
    });

    it('signs in and sets expiresAt with a 60-second margin', async () => {
      vi.useFakeTimers({ now: new Date('2026-10-28T10:00:00Z') });
      await signedIn();
      expect(auth.status()).toBe('signed-in');
      expect(auth.error()).toBeNull();
      expect(auth.expiresAt()).toBe(Date.parse('2026-10-28T10:00:00Z') + SESSION_MS);
      expect(gis.requestOverrides).toEqual([undefined]);
    });

    it('opens one popup for a double click', async () => {
      await auth.prepare();
      auth.signIn();
      auth.signIn();
      expect(gis.requests).toBe(1);
      expect(auth.status()).toBe('signing-in');
    });

    it.each([
      ['the user refuses consent', () => gis.respond({ error: 'access_denied' }), AUTH_MESSAGES.denied],
      [
        'the Sheets permission is unticked',
        () => {
          gis.grantAll = false;
          gis.respond({ access_token: TOKEN, expires_in: LIFETIME_S, scope: '' });
        },
        AUTH_MESSAGES.denied,
      ],
      ['the popup is closed', () => gis.fail('popup_closed'), AUTH_MESSAGES.cancelled],
      ['the popup is blocked', () => gis.fail('popup_failed_to_open'), AUTH_MESSAGES.popupBlocked],
      ['GIS reports an unknown error', () => gis.fail('unknown'), AUTH_MESSAGES.failed],
    ])('stays signed out with a friendly message when %s', async (_case, outcome, message) => {
      await auth.prepare();
      const session = auth.sessionId();
      auth.signIn();
      outcome();
      expect(auth.status()).toBe('signed-out');
      expect(auth.error()).toBe(message);
      expect(auth.expiresAt()).toBeNull();
      expect(auth.sessionId()).toBe(session);

      // The button is usable again: a new click opens a new popup.
      auth.signIn();
      expect(gis.requests).toBe(2);
    });

    it('clearError removes the message', async () => {
      await auth.prepare();
      auth.signIn();
      gis.fail('popup_closed');
      auth.clearError();
      expect(auth.error()).toBeNull();
    });
  });

  describe('first name and sign-out (US-07, D1)', () => {
    beforeEach(() => setup());

    it('shows "Signed in" until the first name arrives, then the name', async () => {
      let resolveProfile: (p: UserProfile | null) => void = () => undefined;
      lookup = () => new Promise((resolve) => (resolveProfile = resolve));
      await signedIn();
      expect(auth.userLabel()).toBe(SIGNED_IN_LABEL);
      expect(profile).toHaveBeenCalledWith(TOKEN);
      resolveProfile({ id: 'acct-1', firstName: 'Ashutosh' });
      await settle();
      expect(auth.userLabel()).toBe('Ashutosh');
    });

    it('keeps "Signed in" when the profile is not available', async () => {
      lookup = () => Promise.resolve(null);
      await signedIn();
      expect(auth.status()).toBe('signed-in');
      expect(auth.userLabel()).toBe(SIGNED_IN_LABEL);
    });

    it('signs out: revokes the token with Google and clears token, name and error', async () => {
      await signedIn();
      auth.signOut();
      expect(gis.revoked).toEqual([TOKEN]);
      expect(auth.status()).toBe('signed-out');
      expect(auth.expiresAt()).toBeNull();
      expect(auth.firstName()).toBeNull();
      expect(auth.error()).toBeNull();
    });

    it('discards a profile that arrives after sign-out', async () => {
      let resolveProfile: (p: UserProfile | null) => void = () => undefined;
      lookup = () => new Promise((resolve) => (resolveProfile = resolve));
      await signedIn();
      auth.signOut();
      resolveProfile({ id: 'acct-1', firstName: 'Late' });
      await settle();
      expect(auth.firstName()).toBeNull();
    });

    it('sign-out before any sign-in does nothing harmful', () => {
      auth.signOut();
      expect(auth.status()).toBe('signed-out');
      expect(gis.revoked).toEqual([]);
    });

    it('the cancelled message tells blocked users what to do', () => {
      expect(AUTH_MESSAGES.cancelled).toContain('ask the owner to add your account as a test user');
    });
  });

  describe('session clock and renewal (US-06)', () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date('2026-10-28T10:00:00Z') });
      setup();
    });

    it('warns 5 minutes before expiry, then expires by itself', async () => {
      await signedIn();
      vi.advanceTimersByTime(SESSION_MS - EXPIRY_WARNING_MS - 1);
      expect(auth.expiryWarning()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(auth.expiryWarning()).toBe(true);
      expect(auth.expiredDialogOpen()).toBe(false);

      vi.advanceTimersByTime(EXPIRY_WARNING_MS);
      expect(auth.status()).toBe('expired');
      expect(auth.expiryWarning()).toBe(false);
      expect(auth.expiredDialogOpen()).toBe(true);
    });

    it('Stay signed in renews early without showing the dialog, and restarts the clock', async () => {
      await signedIn();
      vi.advanceTimersByTime(SESSION_MS - EXPIRY_WARNING_MS);
      auth.renew();
      expect(gis.requestOverrides.at(-1)).toEqual({ prompt: '' });
      expect(auth.status()).toBe('renewing');
      expect(auth.expiredDialogOpen()).toBe(false);
      await expect(auth.freshToken()).resolves.toBe(TOKEN); // old token still valid meanwhile

      await renewed();
      expect(auth.status()).toBe('signed-in');
      expect(auth.expiryWarning()).toBe(false);
      vi.advanceTimersByTime(SESSION_MS - 1);
      expect(auth.status()).toBe('signed-in');
    });

    it('dismissing the warning hides it until expiry', async () => {
      await signedIn();
      vi.advanceTimersByTime(SESSION_MS - EXPIRY_WARNING_MS);
      auth.dismissExpiryWarning();
      expect(auth.expiryWarning()).toBe(false);
      vi.advanceTimersByTime(EXPIRY_WARNING_MS);
      expect(auth.expiredDialogOpen()).toBe(true);
    });

    it('a token past expiresAt (tab asleep) makes freshToken wait for renewal', async () => {
      await signedIn();
      vi.setSystemTime(Date.now() + SESSION_MS + 1); // clock jumped; timers have not fired
      const waiting = auth.freshToken();
      expect(auth.status()).toBe('expired');
      auth.renew();
      await renewed();
      await expect(waiting).resolves.toBe(RENEWED);
    });

    it.each([
      ['closed', 'popup_closed', AUTH_MESSAGES.renewCancelled],
      ['blocked', 'popup_failed_to_open', AUTH_MESSAGES.popupBlocked],
    ] as const)('a %s renewal popup keeps the session expired, with a message', async (_case, type, message) => {
      await signedIn();
      auth.markExpired();
      auth.renew();
      gis.fail(type);
      expect(auth.status()).toBe('expired');
      expect(auth.renewalError()).toBe(message);
      expect(auth.hasSession()).toBe(true);
    });

    it('a closed popup from the early warning goes back to signed in', async () => {
      await signedIn();
      vi.advanceTimersByTime(SESSION_MS - EXPIRY_WARNING_MS);
      auth.renew();
      gis.fail('popup_closed');
      expect(auth.status()).toBe('signed-in');
    });

    it('refused access on renewal signs out', async () => {
      await signedIn();
      auth.markExpired();
      const waiting = auth.freshToken();
      auth.renew();
      gis.respond({ error: 'access_denied' });
      expect(auth.status()).toBe('signed-out');
      expect(auth.error()).toBe(AUTH_MESSAGES.denied);
      await expect(waiting).rejects.toBeInstanceOf(SessionEndedError);
    });

    it('renew is ignored unless expired or warned', async () => {
      await signedIn();
      auth.renew();
      expect(auth.status()).toBe('signed-in');
      expect(gis.requests).toBe(1);
    });

    it('a 401 during an early renewal still resumes on the same session', async () => {
      await signedIn();
      const session = auth.sessionId();
      vi.advanceTimersByTime(SESSION_MS - EXPIRY_WARNING_MS);
      auth.renew();
      auth.markExpired(); // a 401 lands while the popup is open
      const waiting = auth.freshToken();
      await renewed();
      await expect(waiting).resolves.toBe(RENEWED);
      expect(auth.sessionId()).toBe(session);
    });

    it('falls back to comparing first names when Google gives no account id', async () => {
      lookup = () => Promise.resolve({ id: null, firstName: 'Ashutosh' });
      await signedIn();
      const session = auth.sessionId();
      auth.markExpired();
      lookup = () => Promise.resolve({ id: null, firstName: 'Priya' });
      auth.renew();
      await renewed();
      expect(auth.sessionId()).toBe(session + 1);
    });
  });

  describe('when the Google script fails to load', () => {
    it('shows a message and recovers on Retry', async () => {
      let attempt = 0;
      setup(() => (++attempt === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(gis)));

      await auth.prepare();
      expect(auth.gisReady()).toBe(false);
      expect(auth.error()).toBe(AUTH_MESSAGES.scriptFailed);

      auth.retry();
      await auth.prepare();
      expect(attempt).toBe(2);
      expect(auth.gisReady()).toBe(true);
      expect(auth.error()).toBeNull();
    });

    it('Retry after a failed sign-in opens the popup again', async () => {
      setup();
      await auth.prepare();
      auth.signIn();
      gis.fail('popup_closed');
      auth.retry();
      expect(gis.requests).toBe(2);
      expect(auth.status()).toBe('signing-in');
    });
  });
});
