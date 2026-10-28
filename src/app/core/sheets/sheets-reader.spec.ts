import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AUTH_MESSAGES, Auth, SessionEndedError } from '@core/auth/auth';
import { SheetLoadError } from './sheet-load-error';
import { READ_PARAMS, SHEETS_API, SheetsReader } from './sheets-reader';
import { MASTER_SHEET, sheetRow, sheetValues } from './testing/sheet-fixtures';

const URL = `${SHEETS_API}/fake-master-id/values/%27Sheet1%27`;

describe('SheetsReader', () => {
  let http: HttpTestingController;
  let reader: SheetsReader;
  /** Each freshToken() call takes the next answer (a token, or a rejection). */
  let tokens: (() => Promise<string>)[];
  const freshToken = vi.fn(() => (tokens.shift() ?? (() => Promise.resolve('fake-token')))());
  const markExpired = vi.fn();

  /** freshToken() is awaited before the GET, so let it settle first. */
  const tick = async () => {
    for (let i = 0; i < 5; i++) {
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
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Auth, useValue: { freshToken, markExpired } },
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
    [429, null, 'unavailable', "Couldn't load Master. Check your connection and try again."],
    [503, null, 'unavailable', "Couldn't load Master. Check your connection and try again."],
  ])('%i maps to a friendly message naming the sheet', async (status, body, kind, message) => {
    const error = await failWith(status, body);
    expect(error.kind).toBe(kind);
    expect(error.message).toBe(message);
    expect(markExpired).not.toHaveBeenCalled();
  });

  it('a network failure maps to the unavailable message', async () => {
    const pending = reader.read(MASTER_SHEET);
    (await request()).error(new ProgressEvent('error'));
    await expect(pending).rejects.toMatchObject({ kind: 'unavailable' });
  });
});
