import { isSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AppConfig } from '@core/config/app-config';
import { AUTH_MESSAGES, Auth, SIGNED_IN_LABEL } from './auth';
import { PROFILE_SCOPE, REQUESTED_SCOPES, SHEETS_SCOPE } from './auth-scope';
import { GIS_LOADER, GisLoader } from './gis-loader';
import { FakeGis } from './testing/fake-gis';
import { UserProfileReader } from './user-profile';

const TOKEN = 'fake-access-token';

describe('Auth', () => {
  let gis: FakeGis;
  let auth: Auth;
  /** What the fake profile lookup resolves with; tests may replace it. */
  let lookup: (token: string) => Promise<string | null>;
  const firstName = vi.fn((token: string) => lookup(token));

  function setup(loader?: GisLoader): void {
    gis = new FakeGis();
    lookup = () => Promise.resolve('Ashutosh');
    firstName.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: GIS_LOADER, useValue: loader ?? (() => Promise.resolve(gis)) },
        { provide: UserProfileReader, useValue: { firstName } },
      ],
    });
    auth = TestBed.inject(Auth);
  }

  /** Lets the background profile lookup settle. */
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve));

  async function signedIn(): Promise<void> {
    await auth.prepare();
    auth.signIn();
    gis.respond({ access_token: TOKEN, expires_in: 3599, scope: SHEETS_SCOPE });
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

    it('sign-out always ends signed out, even when revoke throws', async () => {
      await signedIn();
      gis.revokeThrows = true;
      auth.signOut();
      expect(auth.status()).toBe('signed-out');
      expect(auth.accessToken()).toBeNull();
    });

    it('never writes the token to browser storage or cookies', async () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const cookiesBefore = document.cookie;
      await signedIn();
      expect(auth.status()).toBe('signed-in');
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
      expect(auth.accessToken()).toBe(TOKEN);
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
      expect(auth.accessToken()).toBe(TOKEN);
      expect(auth.expiresAt()).toBe(Date.parse('2026-10-28T10:00:00Z') + (3599 - 60) * 1000);
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
          gis.respond({ access_token: TOKEN, expires_in: 3599, scope: '' });
        },
        AUTH_MESSAGES.denied,
      ],
      ['the popup is closed', () => gis.fail('popup_closed'), AUTH_MESSAGES.cancelled],
      ['the popup is blocked', () => gis.fail('popup_failed_to_open'), AUTH_MESSAGES.popupBlocked],
      ['GIS reports an unknown error', () => gis.fail('unknown'), AUTH_MESSAGES.failed],
    ])('stays signed out with a friendly message when %s', async (_case, outcome, message) => {
      await auth.prepare();
      auth.signIn();
      outcome();
      expect(auth.status()).toBe('signed-out');
      expect(auth.error()).toBe(message);
      expect(auth.accessToken()).toBeNull();
      expect(auth.expiresAt()).toBeNull();

      // The button is usable again: a new click opens a new popup.
      auth.signIn();
      expect(gis.requests).toBe(2);
    });

    it('markExpired clears the session and asks the user to sign in again', async () => {
      await signedIn();
      auth.markExpired();
      expect(auth.status()).toBe('signed-out');
      expect(auth.accessToken()).toBeNull();
      expect(auth.expiresAt()).toBeNull();
      expect(auth.error()).toBe(AUTH_MESSAGES.expired);
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
      let resolveName: (name: string | null) => void = () => undefined;
      lookup = () => new Promise((resolve) => (resolveName = resolve));
      await signedIn();
      expect(auth.userLabel()).toBe(SIGNED_IN_LABEL);
      expect(firstName).toHaveBeenCalledWith(TOKEN);
      resolveName('Ashutosh');
      await flush();
      expect(auth.firstName()).toBe('Ashutosh');
      expect(auth.userLabel()).toBe('Ashutosh');
    });

    it('keeps "Signed in" when the profile is not available', async () => {
      lookup = () => Promise.resolve(null);
      await signedIn();
      await flush();
      expect(auth.status()).toBe('signed-in');
      expect(auth.userLabel()).toBe(SIGNED_IN_LABEL);
    });

    it('signs out: revokes the token with Google and clears token, name and error', async () => {
      await signedIn();
      await flush();
      auth.signOut();
      expect(gis.revoked).toEqual([TOKEN]);
      expect(auth.status()).toBe('signed-out');
      expect(auth.accessToken()).toBeNull();
      expect(auth.expiresAt()).toBeNull();
      expect(auth.firstName()).toBeNull();
      expect(auth.error()).toBeNull();
    });

    it('discards a first name that arrives after sign-out', async () => {
      let resolveName: (name: string | null) => void = () => undefined;
      lookup = () => new Promise((resolve) => (resolveName = resolve));
      await signedIn();
      auth.signOut();
      resolveName('Late');
      await flush();
      expect(auth.firstName()).toBeNull();
    });

    it('clears the first name when the session expires', async () => {
      await signedIn();
      await flush();
      auth.markExpired();
      expect(auth.firstName()).toBeNull();
      expect(auth.userLabel()).toBe(SIGNED_IN_LABEL);
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
