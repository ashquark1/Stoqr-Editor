import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Mock } from 'vitest';

import { Auth, SessionEndedError } from '@core/auth/auth';
import { AppConfig } from '@core/config/app-config';
import { SheetDefinition, SheetKey } from '@core/config/app-environment';
import { ApprovedChange, ProductChanges, approve } from './approval';
import { RETRY_WAIT } from './backoff';
import { CellValue, mapSheet } from './data-mapping';
import { SheetLoadError } from './sheet-load-error';
import { SHEETS_API, SheetsReader } from './sheets-reader';
import { SheetsWriter, WRITE_OPTIONS, WriteResult } from './sheets-writer';
import { DR_TRUST_SHEET, MASTER_SHEET, sheetRow, sheetValues } from './testing/sheet-fixtures';

const MASTER_URL = `${SHEETS_API}/fake-master-id/values:batchUpdate`;
const DR_TRUST_URL = `${SHEETS_API}/fake-dr-trust-id/values:batchUpdate`;

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
  /** Instant waits, recorded (milliseconds). */
  const wait = vi.fn((_ms: number) => Promise.resolve());

  const masterValues = () => sheetValues(sheetRow({ id: 'row-1', 'stock qty': 10, 'low stock threshold': 5 }));
  // Dr Trust holds a DIFFERENT quantity and its own sheet-local id.
  const drTrustValues = () => sheetValues(sheetRow({ id: 'dt-9', 'stock qty': 3, 'low stock threshold': 5 }));
  const [masterRow] = mapSheet(MASTER_SHEET, masterValues());
  const [drTrustRow] = mapSheet(DR_TRUST_SHEET, drTrustValues());

  const approved = (changes: ProductChanges, reviewed = { stockQty: 10 }): ApprovedChange =>
    approve({ target: masterRow.ref, reviewed, changes });

  /** A linked quantity change: Master guarded by the reviewed qty, Dr Trust overwritten by design. */
  const linked = (stockQty = 7, reviewed = { stockQty: 10 }): ApprovedChange =>
    approve(
      { target: masterRow.ref, reviewed, changes: { stockQty } },
      { target: drTrustRow.ref, reviewed: {}, changes: { stockQty } },
    );

  const tick = async () => {
    for (let i = 0; i < 12; i++) {
      await Promise.resolve();
    }
  };

  async function post(url = MASTER_URL): Promise<TestRequest> {
    await tick();
    return http.expectOne((r) => r.url === url);
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
    wait.mockClear();
    read = vi.fn((sheet: SheetDefinition) => Promise.resolve(sheet.key === 'master' ? masterValues() : drTrustValues()));
    const sheets: Record<SheetKey, SheetDefinition> = { master: MASTER_SHEET, 'dr-trust': DR_TRUST_SHEET };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Auth, useValue: { freshToken, markExpired } },
        { provide: SheetsReader, useValue: { read } },
        { provide: AppConfig, useValue: { sheet: (key: SheetKey) => sheets[key] } },
        { provide: RETRY_WAIT, useValue: wait },
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
    const pending = writer.write(approved({ stockQty: 7 }));
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
      expect(result.sheets).toHaveLength(1);
      expect(result.sheets[0].ref).toBe(masterRow.ref);
      expect(result.sheets[0].product.stockQty).toBe(7);
      expect(result.sheets[0].product.stockStatus).toBe('In Stock');
    }
    http.expectNone(DR_TRUST_URL);
  });

  describe('rules', () => {
    it('refuses anything that is not a genuine approval, sending nothing', async () => {
      const lookalike: unknown = { rows: [{ target: masterRow.ref, reviewed: {}, changes: { stockQty: 1 } }] };
      const result = await writer.write(lookalike as ApprovedChange);
      expectFailed(result, 'not-approved', '');
      expect(read).not.toHaveBeenCalled();
    });

    it('never reports success before Google confirms every cell', async () => {
      const pending = writer.write(approved({ stockQty: 7 }));
      const req = await post();
      const body = req.request.body as SentBody;
      req.flush({
        responses: body.data.map((d, i) => ({ updatedData: { values: i === 0 ? [[8]] : d.values } })),
      });
      expectFailed(await pending, 'unconfirmed');
    });

    it('a response missing cells is not a success', async () => {
      const pending = writer.write(approved({ stockQty: 7 }));
      (await post()).flush({ responses: [] });
      expectFailed(await pending, 'unconfirmed');
    });
  });

  describe('linked products (both sheets)', () => {
    it('rule: one write per sheet, Master then Dr Trust; success only when both confirm', async () => {
      const pending = writer.write(linked());
      const master = await post(MASTER_URL);
      http.expectNone(DR_TRUST_URL); // Dr Trust waits for Master's confirmation.
      echo(master);
      const drTrust = await post(DR_TRUST_URL);
      echo(drTrust);

      const result = await pending;
      expect(result.kind).toBe('written');
      if (result.kind === 'written') {
        expect(result.sheets.map((s) => s.sheet.key)).toEqual(['master', 'dr-trust']);
        expect(result.sheets[1].ref).toBe(drTrustRow.ref);
      }
    });

    it('rule: sets the approved absolute quantity in both sheets even though they differed', async () => {
      const pending = writer.write(linked(7));
      const master = await post(MASTER_URL);
      echo(master);
      const drTrust = await post(DR_TRUST_URL);
      const sent = drTrust.request.body as SentBody;
      expect(sent.data[0]).toMatchObject({ range: "'Sheet1'!K2", values: [[7]] }); // was 3
      expect(sent.data[1].values).toEqual([['In Stock']]);
      echo(drTrust);
      const result = await pending;
      expect(result.kind === 'written' && result.sheets.map((s) => s.product.stockQty)).toEqual([7, 7]);
    });

    it('re-reads both sheets before writing either', async () => {
      const pending = writer.write(linked());
      const master = await post(MASTER_URL);
      expect(read).toHaveBeenCalledWith(MASTER_SHEET);
      expect(read).toHaveBeenCalledWith(DR_TRUST_SHEET);
      echo(master);
      echo(await post(DR_TRUST_URL));
      await pending;
    });

    it('a Master conflict sends nothing to either sheet', async () => {
      const result = await writer.write(linked(7, { stockQty: 12 }));
      expect(result.kind).toBe('conflict');
      if (result.kind === 'conflict') {
        expect(result.sheet.key).toBe('master');
        expect(result.current.product.stockQty).toBe(10);
      }
      http.expectNone(MASTER_URL);
      http.expectNone(DR_TRUST_URL);
    });

    it('a Dr Trust row that is gone sends nothing to either sheet (check both first)', async () => {
      read.mockImplementation((sheet) =>
        Promise.resolve(sheet.key === 'master' ? masterValues() : sheetValues(sheetRow({ id: 'someone-else' }))),
      );
      expectFailed(await writer.write(linked()), 'row-missing', 'Dr Trust');
      http.expectNone(MASTER_URL);
      http.expectNone(DR_TRUST_URL);
    });

    it('no access to Dr Trust (403 on the re-read) blocks the change and names that sheet', async () => {
      read.mockImplementation((sheet) =>
        sheet.key === 'master'
          ? Promise.resolve(masterValues())
          : Promise.reject(new SheetLoadError('Dr Trust', 'access', "You don't have access to Dr Trust.")),
      );
      expectFailed(await writer.write(linked()), 'access', 'Dr Trust');
      http.expectNone(MASTER_URL);
    });

    it('a Master write failure stops before Dr Trust', async () => {
      const pending = writer.write(linked());
      (await post(MASTER_URL)).flush(null, { status: 403, statusText: 'Forbidden' });
      expectFailed(await pending, 'access', 'Master');
      http.expectNone(DR_TRUST_URL);
    });

    it('a Dr Trust 503 after Master is partial with the "didn\'t confirm" reason (US-11)', async () => {
      const pending = writer.write(linked());
      echo(await post(MASTER_URL));
      (await post(DR_TRUST_URL)).flush(null, { status: 503, statusText: 'Unavailable' });
      const result = await pending;
      expect(result.kind).toBe('partial');
      if (result.kind === 'partial') {
        expect(result.error).toMatchObject({ sheetLabel: 'Dr Trust', kind: 'unconfirmed' });
        expect(result.error.message).toContain("Google didn't confirm the save to Dr Trust");
      }
    });

    it('rule: a Dr Trust failure after Master is partial, naming both sheets, never success', async () => {
      const pending = writer.write(linked());
      echo(await post(MASTER_URL));
      (await post(DR_TRUST_URL)).flush(null, { status: 403, statusText: 'Forbidden' });

      const result = await pending;
      expect(result.kind).toBe('partial');
      if (result.kind === 'partial') {
        expect(result.written.map((s) => s.sheet.label)).toEqual(['Master']);
        expect(result.error.sheetLabel).toBe('Dr Trust');
        expect(result.error.kind).toBe('access');
        expect(ApprovedChange.isGenuine(result.remaining)).toBe(true);
        expect(result.remaining.rows.map((r) => r.target)).toEqual([drTrustRow.ref]);
      }
    });

    describe('Retry of a partial (US-34)', () => {
      async function partialResult(): Promise<Extract<WriteResult, { kind: 'partial' }>> {
        const pending = writer.write(linked());
        echo(await post(MASTER_URL));
        (await post(DR_TRUST_URL)).flush(null, { status: 503, statusText: 'Unavailable' });
        const result = await pending;
        if (result.kind !== 'partial') {
          throw new Error(`expected partial, got ${result.kind}`);
        }
        read.mockClear();
        return result;
      }

      it('rule: re-reads Dr Trust only and sends one Dr Trust request, no Master request', async () => {
        const { remaining } = await partialResult();
        const pending = writer.write(remaining);
        const req = await post(DR_TRUST_URL);
        http.expectNone(MASTER_URL);
        expect(read.mock.calls.map(([s]) => s.key)).toEqual(['dr-trust']);
        echo(req);
        const result = await pending;
        expect(result.kind === 'written' && result.sheets.map((s) => s.sheet.key)).toEqual(['dr-trust']);
      });

      it('rule: writes the same absolute qty even when Dr Trust changed meanwhile', async () => {
        const { remaining } = await partialResult();
        read.mockImplementation(() => Promise.resolve(sheetValues(sheetRow({ id: 'dt-9', 'stock qty': 50 }))));
        const pending = writer.write(remaining);
        const req = await post(DR_TRUST_URL);
        expect((req.request.body as SentBody).data[0]).toMatchObject({ range: "'Sheet1'!K2", values: [[7]] });
        echo(req);
        expect((await pending).kind).toBe('written');
      });

      it('a Dr Trust row that is gone fails without writing', async () => {
        const { remaining } = await partialResult();
        read.mockImplementation(() => Promise.resolve(sheetValues(sheetRow({ id: 'gone' }))));
        expectFailed(await writer.write(remaining), 'row-missing', 'Dr Trust');
        http.expectNone(DR_TRUST_URL);
      });
    });

    it('a Dr Trust row that changed while Master was saving is partial, not a silent skip', async () => {
      const pending = writer.write(linked());
      echo(await post(MASTER_URL));
      read.mockImplementation((sheet) =>
        Promise.resolve(sheet.key === 'master' ? masterValues() : sheetValues(sheetRow({ id: 'gone' }))),
      );
      (await post(DR_TRUST_URL)).flush(null, { status: 401, statusText: 'Unauthorized' });
      const result = await pending;
      expect(result.kind).toBe('partial');
      if (result.kind === 'partial') {
        expect(result.error).toMatchObject({ sheetLabel: 'Dr Trust', kind: 'row-missing' });
      }
    });

    it('a 401 on Dr Trust re-reads Dr Trust only and retries it; Master is not rewritten', async () => {
      const pending = writer.write(linked());
      echo(await post(MASTER_URL));
      expect(read).toHaveBeenCalledTimes(2);
      (await post(DR_TRUST_URL)).flush(null, { status: 401, statusText: 'Unauthorized' });
      const retry = await post(DR_TRUST_URL);
      expect(markExpired).toHaveBeenCalledTimes(1);
      expect(read).toHaveBeenCalledTimes(3);
      expect(read).toHaveBeenLastCalledWith(DR_TRUST_SHEET);
      echo(retry);
      expect((await pending).kind).toBe('written');
      http.expectNone(MASTER_URL);
    });
  });

  it('a conflict sends nothing and returns the fresh values', async () => {
    const result = await writer.write(approved({ stockQty: 7 }, { stockQty: 12 }));
    expect(result.kind).toBe('conflict');
    if (result.kind === 'conflict') {
      expect(result.ref).toBe(masterRow.ref);
      expect(result.current.product.stockQty).toBe(10);
    }
    http.expectNone(MASTER_URL);
  });

  it.each([
    ['the row is gone', () => sheetValues(sheetRow({ id: 'other' })), 'row-missing'],
    ['its id now appears twice', () => sheetValues(sheetRow({ id: 'row-1' }), sheetRow({ id: 'row-1' })), 'row-duplicated'],
  ])('fails without writing when %s', async (_case, fresh, kind) => {
    read.mockImplementation(() => Promise.resolve(fresh()));
    expectFailed(await writer.write(approved({ stockQty: 7 })), kind);
    http.expectNone(MASTER_URL);
  });

  it('fails without writing when the re-read finds a missing column', async () => {
    read.mockImplementation(() => Promise.reject(new SheetLoadError('Master', 'columns', 'Master sheet is missing column: mrp')));
    expectFailed(await writer.write(approved({ stockQty: 7 })), 'columns');
  });

  it('a 401 waits for renewal, re-reads and sends again once', async () => {
    tokens = [() => Promise.resolve('old-token'), () => Promise.resolve('renewed-token')];
    const pending = writer.write(approved({ stockQty: 7 }));
    (await post()).flush(null, { status: 401, statusText: 'Unauthorized' });
    const retry = await post();
    expect(markExpired).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(2);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer renewed-token');
    echo(retry);
    expect((await pending).kind).toBe('written');
  });

  it('a second 401 fails as expired', async () => {
    const pending = writer.write(approved({ stockQty: 7 }));
    (await post()).flush(null, { status: 401, statusText: 'Unauthorized' });
    (await post()).flush(null, { status: 401, statusText: 'Unauthorized' });
    expectFailed(await pending, 'expired');
  });

  it('signing out instead of renewing fails as expired, sending nothing', async () => {
    tokens = [() => Promise.reject(new SessionEndedError())];
    expectFailed(await writer.write(approved({ stockQty: 7 })), 'expired');
    http.expectNone(MASTER_URL);
  });

  it.each([
    [403, 'access'],
    [404, 'not-found'],
    [400, 'unavailable'],
  ])('HTTP %i fails as %s (never success, never retried)', async (status, kind) => {
    const pending = writer.write(approved({ stockQty: 7 }));
    (await post()).flush(null, { status, statusText: 'Error' });
    expectFailed(await pending, kind);
    expect(wait).not.toHaveBeenCalled();
  });

  describe('busy and unreachable (US-11)', () => {
    const busy = async (url = MASTER_URL) => (await post(url)).flush(null, { status: 429, statusText: 'Too Many Requests' });

    it('rule: a 429 waits, re-reads and re-checks the row, then resends', async () => {
      const pending = writer.write(approved({ stockQty: 7 }));
      await busy();
      const resend = await post();
      expect(wait).toHaveBeenCalledTimes(1);
      expect(read).toHaveBeenCalledTimes(2); // the first check + the re-check before the resend
      echo(resend);
      expect((await pending).kind).toBe('written');
    });

    it('rule: at most 3 resends; then busy, nothing reported as saved', async () => {
      const pending = writer.write(approved({ stockQty: 7 }));
      for (let i = 0; i < 4; i++) {
        await busy();
      }
      const result = await pending;
      expectFailed(result, 'unavailable');
      if (result.kind === 'failed') {
        expect(result.error.message).toBe(
          'Google is busy right now (too many requests). Nothing was saved to Master. Wait a minute and try again.',
        );
      }
      expect(wait).toHaveBeenCalledTimes(3);
      http.expectNone(MASTER_URL);
    });

    it('a conflict found by the re-check after a 429 sends nothing more', async () => {
      const pending = writer.write(approved({ stockQty: 7 }));
      read.mockImplementation(() =>
        Promise.resolve(sheetValues(sheetRow({ id: 'row-1', 'stock qty': 12, 'low stock threshold': 5 }))),
      );
      await busy();
      const result = await pending;
      expect(result.kind).toBe('conflict');
      http.expectNone(MASTER_URL);
    });

    it.each([
      ['a 503', (req: TestRequest) => req.flush(null, { status: 503, statusText: 'Unavailable' })],
      ['a network failure', (req: TestRequest) => req.error(new ProgressEvent('error'))],
    ])('rule: %s is never resent and never claimed "not saved"', async (_case, failRequest) => {
      const pending = writer.write(approved({ stockQty: 7 }));
      failRequest(await post());
      const result = await pending;
      expectFailed(result, 'unconfirmed');
      if (result.kind === 'failed') {
        expect(result.error.message).toBe(
          "Google didn't confirm the save to Master, so it may or may not have been saved. Try again re-checks the sheet first.",
        );
      }
      expect(wait).not.toHaveBeenCalled();
      http.expectNone(MASTER_URL);
    });
  });
});
