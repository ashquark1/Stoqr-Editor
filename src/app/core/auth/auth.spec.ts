import { isSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AppConfig } from '@core/config/app-config';
import { AUTH_MESSAGES, Auth } from './auth';
import { SHEETS_SCOPE } from './auth-scope';
import { GIS_LOADER, GisLoader } from './gis-loader';
import { FakeGis } from './testing/fake-gis';

const TOKEN = 'fake-access-token';

describe('Auth', () => {
  let gis: FakeGis;
  let auth: Auth;

  function setup(loader?: GisLoader): void {
    gis = new FakeGis();
    TestBed.configureTestingModule({
      providers: [{ provide: GIS_LOADER, useValue: loader ?? (() => Promise.resolve(gis)) }],
    });
    auth = TestBed.inject(Auth);
  }

  async function signedIn(): Promise<void> {
    await auth.prepare();
    auth.signIn();
    gis.respond({ access_token: TOKEN, expires_in: 3599, scope: SHEETS_SCOPE });
  }

  afterEach(() => vi.useRealTimers());

  describe('rules', () => {
    beforeEach(() => setup());

    it('requests exactly the Sheets scope with the configured Client ID', async () => {
      await auth.prepare();
      expect(gis.config?.scope).toBe(SHEETS_SCOPE);
      expect(gis.config?.client_id).toBe(TestBed.inject(AppConfig).clientId());
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
