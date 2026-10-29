import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AUTH_MESSAGES, Auth, SessionEndedError } from '@core/auth/auth';
import { RETRY_WAIT } from './backoff';
import { SheetLoadError } from './sheet-load-error';
import { BUSY_LOAD_MESSAGE, READ_PARAMS, SHEETS_API, SheetsReader, TAB_FIELDS } from './sheets-reader';
import { MASTER_SHEET, sheetRow, sheetValues } from './testing/sheet-fixtures';

const URL = `${SHEETS_API}/fake-master-id/values/%27Sheet1%27`;

describe('SheetsReader', () => {
  let http: HttpTestingController;
  let reader: SheetsReader;
  /** Each freshToken() call takes the next answer (a token, or a rejection). */
  let tokens: (() => Promise<string>)[];
  const freshToken = vi.fn(() => (tokens.shift() ?? (() => Promise.resolve('fake-token')))());
  const markExpired = vi.fn();
  /** Instant waits, recorded (milliseconds). */
  const wait = vi.fn((_ms: number) => Promise.resolve());

  /** freshToken() is awaited before the GET, so let it settle first. */
  const tick = async () => {
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
    }
  };

  async function request() {
    await tick();
    return http.expectOne((r) => r.url === URL);
  }

  beforeEach(() => {
    tokens = [];
    freshToken.mockClear();
    markExpired.mockReset();
    wait.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Auth, useValue: { freshToken, markExpired } },
        { provide: RETRY_WAIT, useValue: wait },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    reader = TestBed.inject(SheetsReader);
  });

  afterEach(() => http.verify());

  async function failWith(status: number, body: object | null = null): Promise<SheetLoadError> {
    const pending = reader.read(MASTER_SHEET);
    (await request()).flush(body, { status, statusText: 'Error' });
    const error = await pending.catch((e: unknown) => e);
    if (!(error instanceof SheetLoadError)) {
      throw new Error('expected a SheetLoadError');
    }
    return error;
  }

  it('GETs the whole tab with a fresh bearer token and raw-value options', async () => {
    const values = sheetValues(sheetRow());
    const pending = reader.read(MASTER_SHEET);
    const req = await request();
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
    for (const [name, value] of Object.entries(READ_PARAMS)) {
      expect(req.request.params.get(name)).toBe(value);
    }
    req.flush({ range: "'Sheet1'!A1:U2", majorDimension: 'ROWS', values });
    await expect(pending).resolves.toEqual(values);
  });

  it('returns undefined for an empty tab (the API omits values)', async () => {
    const pending = reader.read(MASTER_SHEET);
    (await request()).flush({ range: "'Sheet1'!A1:Z1000" });
    await expect(pending).resolves.toBeUndefined();
  });

  describe('expiry (US-06)', () => {
    it('rule: a 401 waits for renewal and retries once with the new token', async () => {
      tokens = [() => Promise.resolve('old-token'), () => Promise.resolve('renewed-token')];
      const values = sheetValues(sheetRow());
      const pending = reader.read(MASTER_SHEET);

      const first = await request();
      expect(first.request.headers.get('Authorization')).toBe('Bearer old-token');
      first.flush(null, { status: 401, statusText: 'Unauthorized' });

      const retry = await request();
      expect(markExpired).toHaveBeenCalledTimes(1);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer renewed-token');
      retry.flush({ values });
      await expect(pending).resolves.toEqual(values);
    });

    it('a second 401 is reported as an expired session', async () => {
      const pending = reader.read(MASTER_SHEET);
      (await request()).flush(null, { status: 401, statusText: 'Unauthorized' });
      (await request()).flush(null, { status: 401, statusText: 'Unauthorized' });
      await expect(pending).rejects.toMatchObject({ kind: 'expired', message: AUTH_MESSAGES.expired });
      expect(markExpired).toHaveBeenCalledTimes(2);
    });

    it('signing out while waiting for renewal ends the read as expired, with no retry', async () => {
      tokens = [() => Promise.resolve('old-token'), () => Promise.reject(new SessionEndedError())];
      const pending = reader.read(MASTER_SHEET);
      (await request()).flush(null, { status: 401, statusText: 'Unauthorized' });
      await expect(pending).rejects.toMatchObject({ kind: 'expired' });
      http.expectNone(() => true);
    });

    it('does not call the API when the session has already ended', async () => {
      tokens = [() => Promise.reject(new SessionEndedError())];
      await expect(reader.read(MASTER_SHEET)).rejects.toMatchObject({ kind: 'expired' });
      http.expectNone(() => true);
    });
  });

  it.each<[number, object | null, string, string]>([
    [403, null, 'access', "You don't have access to Master. Ask the owner to share it with you as Editor."],
    [404, null, 'not-found', 'Master spreadsheet not found, check configuration.'],
    [
      400,
      { error: { code: 400, message: 'Unable to parse range: Sheet1' } },
      'tab',
      'Tab Sheet1 not found in Master.',
    ],
    [400, { error: { message: 'Bad request' } }, 'unavailable', "Couldn't load Master. Check your connection and try again."],
  ])('%i maps to a friendly message naming the sheet, without retrying', async (status, body, kind, message) => {
    const error = await failWith(status, body);
    expect(error.kind).toBe(kind);
    expect(error.message).toBe(message);
    expect(markExpired).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
  });

  describe('tabId (US-19 fix)', () => {
    const TABS_URL = `${SHEETS_API}/fake-master-id`;
    const tabs = async () => {
      await tick();
      return http.expectOne((r) => r.url === TABS_URL);
    };

    it('GETs only the tab properties and returns the number of the tab with the exact title', async () => {
      const pending = reader.tabId(MASTER_SHEET);
      const req = await tabs();
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
      expect(req.request.params.get('fields')).toBe(TAB_FIELDS);
      req.flush({
        sheets: [
          { properties: { sheetId: 0, title: 'Archive' } },
          { properties: { sheetId: 1234, title: 'Sheet1' } },
          { properties: { sheetId: 55, title: 'sheet1' } },
        ],
      });
      await expect(pending).resolves.toBe(1234);
    });

    it('a sheetId left out by Google is 0 (the first tab)', async () => {
      const pending = reader.tabId(MASTER_SHEET);
      (await tabs()).flush({ sheets: [{ properties: { title: 'Sheet1' } }] });
      await expect(pending).resolves.toBe(0);
    });

    it('a missing tab is a "tab not found" error naming the sheet', async () => {
      const pending = reader.tabId(MASTER_SHEET);
      (await tabs()).flush({ sheets: [{ properties: { sheetId: 3, title: 'Other' } }] });
      await expect(pending).rejects.toMatchObject({ kind: 'tab', message: 'Tab Sheet1 not found in Master.' });
    });

    it('uses the same error, renewal and backoff rules as read()', async () => {
      const pending = reader.tabId(MASTER_SHEET);
      (await tabs()).flush(null, { status: 429, statusText: 'Too Many Requests' });
      (await tabs()).flush(null, { status: 401, statusText: 'Unauthorized' });
      (await tabs()).flush(null, { status: 403, statusText: 'Forbidden' });
      await expect(pending).rejects.toMatchObject({ kind: 'access' });
      expect(wait).toHaveBeenCalledTimes(1);
      expect(markExpired).toHaveBeenCalledTimes(1);
    });
  });

  describe('backoff (US-11)', () => {
    const fail = async (status: number, headers: Record<string, string> = {}) =>
      (await request()).flush(null, { status, statusText: 'Error', headers });
    const offline = async () => (await request()).error(new ProgressEvent('error'));

    it('a 429, then success: loads after one wait, with a fresh token', async () => {
      const values = sheetValues(sheetRow());
      const pending = reader.read(MASTER_SHEET);
      await fail(429);
      (await request()).flush({ values });
      await expect(pending).resolves.toEqual(values);
      expect(wait).toHaveBeenCalledTimes(1);
      expect(wait.mock.calls[0][0]).toBeGreaterThanOrEqual(800);
      expect(wait.mock.calls[0][0]).toBeLessThanOrEqual(1200);
      expect(freshToken).toHaveBeenCalledTimes(2);
    });

    it('three 503s, then success: loads', async () => {
      const values = sheetValues(sheetRow());
      const pending = reader.read(MASTER_SHEET);
      await fail(503);
      await fail(502);
      await offline();
      (await request()).flush({ values });
      await expect(pending).resolves.toEqual(values);
      expect(wait).toHaveBeenCalledTimes(3);
    });

    it('rule: at most 3 retries; then the unreachable message', async () => {
      const pending = reader.read(MASTER_SHEET);
      for (let i = 0; i < 4; i++) {
        await offline();
      }
      await expect(pending).rejects.toMatchObject({
        kind: 'unavailable',
        message: "Couldn't reach Google to load Master. Check your connection, then Retry.",
      });
      expect(wait).toHaveBeenCalledTimes(3);
      http.expectNone(URL);
    });

    it('four 429s: the busy message', async () => {
      const pending = reader.read(MASTER_SHEET);
      for (let i = 0; i < 4; i++) {
        await fail(429);
      }
      await expect(pending).rejects.toMatchObject({ kind: 'unavailable', message: BUSY_LOAD_MESSAGE });
    });

    it('honours Retry-After (seconds)', async () => {
      const pending = reader.read(MASTER_SHEET);
      await fail(429, { 'Retry-After': '5' });
      (await request()).flush({ values: [] });
      await pending;
      expect(wait).toHaveBeenCalledWith(5000);
    });

    it('a 401 between transient errors still renews once', async () => {
      tokens = [() => Promise.resolve('t1'), () => Promise.resolve('t2'), () => Promise.resolve('t3')];
      const pending = reader.read(MASTER_SHEET);
      await fail(503);
      await fail(401);
      const last = await request();
      expect(last.request.headers.get('Authorization')).toBe('Bearer t3');
      last.flush({ values: [] });
      await expect(pending).resolves.toEqual([]);
      expect(markExpired).toHaveBeenCalledTimes(1);
    });
  });
});
