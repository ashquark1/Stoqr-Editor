import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AUTH_MESSAGES, Auth } from '@core/auth/auth';
import { SheetLoadError } from './sheet-load-error';
import { READ_PARAMS, SHEETS_API, SheetsReader } from './sheets-reader';
import { MASTER_SHEET, sheetRow, sheetValues } from './testing/sheet-fixtures';

const URL = `${SHEETS_API}/fake-master-id/values/%27Sheet1%27`;

describe('SheetsReader', () => {
  let http: HttpTestingController;
  let reader: SheetsReader;
  let token: string | null;
  let expiresAt: number | null;
  const markExpired = vi.fn();

  beforeEach(() => {
    token = 'fake-token';
    expiresAt = Date.now() + 60_000;
    markExpired.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Auth,
          useValue: { accessToken: () => token, expiresAt: () => expiresAt, markExpired },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    reader = TestBed.inject(SheetsReader);
  });

  afterEach(() => http.verify());

  async function failWith(status: number, body: object | null = null): Promise<SheetLoadError> {
    const pending = reader.read(MASTER_SHEET);
    http.expectOne((r) => r.url === URL).flush(body, { status, statusText: 'Error' });
    const error = await pending.catch((e: unknown) => e);
    if (!(error instanceof SheetLoadError)) {
      throw new Error('expected a SheetLoadError');
    }
    return error;
  }

  it('GETs the whole tab with the bearer token and raw-value options', async () => {
    const values = sheetValues(sheetRow());
    const pending = reader.read(MASTER_SHEET);
    const req = http.expectOne((r) => r.url === URL);
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
    http.expectOne((r) => r.url === URL).flush({ range: "'Sheet1'!A1:Z1000" });
    await expect(pending).resolves.toBeUndefined();
  });

  it('401: marks the session expired', async () => {
    const error = await failWith(401);
    expect(error.kind).toBe('expired');
    expect(error.message).toBe(AUTH_MESSAGES.expired);
    expect(markExpired).toHaveBeenCalledTimes(1);
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
    http.expectOne((r) => r.url === URL).error(new ProgressEvent('error'));
    await expect(pending).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it.each([
    ['there is no token', () => (token = null)],
    ['the token has passed expiresAt', () => (expiresAt = Date.now() - 1)],
  ])('does not call the API when %s, and marks the session expired', async (_case, arrange) => {
    arrange();
    await expect(reader.read(MASTER_SHEET)).rejects.toMatchObject({ kind: 'expired' });
    expect(markExpired).toHaveBeenCalledTimes(1);
    http.expectNone(() => true);
  });
});
