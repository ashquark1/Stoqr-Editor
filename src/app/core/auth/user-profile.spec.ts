import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { USERINFO_URL, UserProfileReader, firstNameFrom } from './user-profile';

describe('firstNameFrom', () => {
  it.each([
    [{ given_name: 'Ashutosh', name: 'Ashutosh Sharma' }, 'Ashutosh'],
    [{ given_name: '  Asha ' }, 'Asha'],
    [{ name: 'Priya  Nair' }, 'Priya'],
    [{ given_name: ' ', name: 'Ravi Kumar' }, 'Ravi'],
    [{ name: '   ' }, null],
    [{}, null],
  ])('%j -> %j', (info, expected) => {
    expect(firstNameFrom(info)).toBe(expected);
  });
});

describe('UserProfileReader', () => {
  let http: HttpTestingController;
  let reader: UserProfileReader;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    reader = TestBed.inject(UserProfileReader);
  });

  afterEach(() => http.verify());

  it('GETs Google userinfo with the bearer token and returns the account id and first name', async () => {
    const pending = reader.profile('fake-token');
    const req = http.expectOne(USERINFO_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
    req.flush({ sub: '1234567890', given_name: 'Ashutosh', name: 'Ashutosh Sharma' });
    await expect(pending).resolves.toEqual({ id: '1234567890', firstName: 'Ashutosh' });
  });

  it('returns a null id when Google sends no account id', async () => {
    const pending = reader.profile('fake-token');
    http.expectOne(USERINFO_URL).flush({ given_name: 'Asha' });
    await expect(pending).resolves.toEqual({ id: null, firstName: 'Asha' });
  });

  it.each([401, 403, 500])('resolves to null on HTTP %i (sign-in never depends on it)', async (status) => {
    const pending = reader.profile('fake-token');
    http.expectOne(USERINFO_URL).flush(null, { status, statusText: 'Error' });
    await expect(pending).resolves.toBeNull();
  });

  it('resolves to null on a network failure', async () => {
    const pending = reader.profile('fake-token');
    http.expectOne(USERINFO_URL).error(new ProgressEvent('error'));
    await expect(pending).resolves.toBeNull();
  });
});
