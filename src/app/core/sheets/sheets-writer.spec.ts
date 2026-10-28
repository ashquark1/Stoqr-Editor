import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Mock } from 'vitest';

import { Auth, SessionEndedError } from '@core/auth/auth';
import { SheetDefinition } from '@core/config/app-environment';
import { ApprovedChange, ProductChanges, approve } from './approval';
import { CellValue, mapSheet } from './data-mapping';
import { SheetLoadError } from './sheet-load-error';
import { SHEETS_API, SheetsReader } from './sheets-reader';
import { SheetsWriter, WRITE_OPTIONS, WriteResult } from './sheets-writer';
import { DR_TRUST_SHEET, MASTER_SHEET, sheetRow, sheetValues } from './testing/sheet-fixtures';

const URL = `${SHEETS_API}/fake-master-id/values:batchUpdate`;

interface SentBody {
  readonly valueInputOption: string;
  readonly includeValuesInResponse: boolean;
  readonly data: readonly { readonly range: string; readonly values: CellValue[][] }[];
}

describe('SheetsWriter', () => {
  let http: HttpTestingController;
  let writer: SheetsWriter;
  let read: Mock<(sheet: SheetDefinition) => Promise<CellValue[][] | undefined>>;
  let tokens: (() => Promise<string>)[];
  const freshToken = vi.fn(() => (tokens.shift() ?? (() => Promise.resolve('fake-token')))());
  const markExpired = vi.fn();

  const sheet = () => sheetValues(sheetRow({ id: 'row-1', 'stock qty': 10, 'low stock threshold': 5 }));
  const [row] = mapSheet(MASTER_SHEET, sheet());

  const approved = (changes: ProductChanges, reviewed = { stockQty: 10 }): ApprovedChange =>
    approve({ target: row.ref, reviewed, changes });

  const tick = async () => {
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
    }
  };

  async function post(): Promise<TestRequest> {
    await tick();
    return http.expectOne((r) => r.url === URL);
  }

  /** Google's answer echoing exactly what was sent (a confirmed write). */
  function echo(req: TestRequest): void {
    const body = req.request.body as SentBody;
    req.flush({ responses: body.data.map((d) => ({ updatedRange: d.range, updatedData: { range: d.range, values: d.values } })) });
  }

  beforeEach(() => {
    tokens = [];
    freshToken.mockClear();
    markExpired.mockReset();
    read = vi.fn(() => Promise.resolve(sheet()));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Auth, useValue: { freshToken, markExpired } },
        { provide: SheetsReader, useValue: { read } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    writer = TestBed.inject(SheetsWriter);
  });

  afterEach(() => http.verify());

  function expectFailed(result: WriteResult, kind: string, sheetLabel = 'Master'): void {
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.error.kind).toBe(kind);
      expect(result.error.sheetLabel).toBe(sheetLabel);
    }
  }

  it('re-reads, then POSTs one batchUpdate of exact cells, RAW, asking for the values back', async () => {
    const pending = writer.write(MASTER_SHEET, approved({ stockQty: 7 }));
    const req = await post();
    expect(read).toHaveBeenCalledWith(MASTER_SHEET);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
    const body = req.request.body as SentBody;
    expect(body.valueInputOption).toBe('RAW');
    expect(body.includeValuesInResponse).toBe(true);
    expect(body).toMatchObject(WRITE_OPTIONS);
    expect(body.data.map((d) => d.range)).toEqual(["'Sheet1'!K2", "'Sheet1'!M2", "'Sheet1'!T2"]);
    expect(body.data.map((d) => d.values)).toEqual([[[7]], [['In Stock']], [[expect.any(Number)]]]);
    echo(req);

    const result = await pending;
    expect(result.kind).toBe('written');
    if (result.kind === 'written') {
      expect(result.product.stockQty).toBe(7);
      expect(result.product.stockStatus).toBe('In Stock');
    }
  });

  describe('rules', () => {
    it('refuses anything that is not a genuine approval, sending nothing', async () => {
      const lookalike: unknown = { change: { target: row.ref, reviewed: {}, changes: { stockQty: 1 } } };
      const result = await writer.write(MASTER_SHEET, lookalike as ApprovedChange);
      expectFailed(result, 'not-approved');
      expect(read).not.toHaveBeenCalled();
    });

    it('never reports success before Google confirms every cell', async () => {
      const pending = writer.write(MASTER_SHEET, approved({ stockQty: 7 }));
      const req = await post();
      const body = req.request.body as SentBody;
      req.flush({
        responses: body.data.map((d, i) => ({ updatedData: { values: i === 0 ? [[8]] : d.values } })),
      });
      expectFailed(await pending, 'unconfirmed');
    });

    it('a response missing cells is not a success', async () => {
      const pending = writer.write(MASTER_SHEET, approved({ stockQty: 7 }));
      (await post()).flush({ responses: [] });
      expectFailed(await pending, 'unconfirmed');
    });
  });

  it('a conflict sends nothing and returns the fresh values', async () => {
    const result = await writer.write(MASTER_SHEET, approved({ stockQty: 7 }, { stockQty: 12 }));
    expect(result.kind).toBe('conflict');
    if (result.kind === 'conflict') {
      expect(result.current.product.stockQty).toBe(10);
    }
    http.expectNone(URL);
  });

  it('rejects a change for a row in the other sheet', async () => {
    expectFailed(await writer.write(DR_TRUST_SHEET, approved({ stockQty: 7 })), 'wrong-sheet', 'Dr Trust');
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    ['the row is gone', () => sheetValues(sheetRow({ id: 'other' })), 'row-missing'],
    ['its id now appears twice', () => sheetValues(sheetRow({ id: 'row-1' }), sheetRow({ id: 'row-1' })), 'row-duplicated'],
  ])('fails without writing when %s', async (_case, fresh, kind) => {
    read.mockImplementation(() => Promise.resolve(fresh()));
    expectFailed(await writer.write(MASTER_SHEET, approved({ stockQty: 7 })), kind);
    http.expectNone(URL);
  });

  it('fails without writing when the re-read finds a missing column', async () => {
    read.mockImplementation(() => Promise.reject(new SheetLoadError('Master', 'columns', 'Master sheet is missing column: mrp')));
    expectFailed(await writer.write(MASTER_SHEET, approved({ stockQty: 7 })), 'columns');
  });

  it('a 401 waits for renewal and redoes the whole write once (re-read included)', async () => {
    tokens = [() => Promise.resolve('old-token'), () => Promise.resolve('renewed-token')];
    const pending = writer.write(MASTER_SHEET, approved({ stockQty: 7 }));
    (await post()).flush(null, { status: 401, statusText: 'Unauthorized' });
    const retry = await post();
    expect(markExpired).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(2);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer renewed-token');
    echo(retry);
    expect((await pending).kind).toBe('written');
  });

  it('a second 401 fails as expired', async () => {
    const pending = writer.write(MASTER_SHEET, approved({ stockQty: 7 }));
    (await post()).flush(null, { status: 401, statusText: 'Unauthorized' });
    (await post()).flush(null, { status: 401, statusText: 'Unauthorized' });
    expectFailed(await pending, 'expired');
  });

  it('signing out instead of renewing fails as expired, sending nothing', async () => {
    tokens = [() => Promise.reject(new SessionEndedError())];
    expectFailed(await writer.write(MASTER_SHEET, approved({ stockQty: 7 })), 'expired');
    http.expectNone(URL);
  });

  it.each([
    [403, 'access'],
    [404, 'not-found'],
    [429, 'unavailable'],
    [503, 'unavailable'],
  ])('HTTP %i fails as %s (never success)', async (status, kind) => {
    const pending = writer.write(MASTER_SHEET, approved({ stockQty: 7 }));
    (await post()).flush(null, { status, statusText: 'Error' });
    expectFailed(await pending, kind);
  });

  it('a network failure fails as unavailable', async () => {
    const pending = writer.write(MASTER_SHEET, approved({ stockQty: 7 }));
    (await post()).error(new ProgressEvent('error'));
    expectFailed(await pending, 'unavailable');
  });
});
