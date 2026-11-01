import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { AppConfig } from '@core/config/app-config';
import { PanelStore } from '@core/layout/panel-store';
import { ApprovedCreate, InvalidChangeError, approveCreate } from '@core/sheets/approval';
import { ResultStrip, ReviewStep, failureText, partialText } from '@core/sheets/review-flow';
import { RowRef } from '@core/sheets/row-ref';
import { SheetsStore } from '@core/sheets/sheets-store';
import { CreateResult, CreatedRow, SheetsWriter, WriteFailureKind } from '@core/sheets/sheets-writer';
import { StockLogStore } from '@core/stock-adjust/stock-log-store';
import { EDITABLE_DETAILS } from './details-fields';
import { DetailsStore } from './details-store';

/** One reviewed value: `Label value` (US-100). */
export interface NewProductLine {
  readonly field: string;
  readonly label: string;
  readonly value: string;
}

/** Buttons on a New product result strip (US-100). */
export type NewProductStripAction = 'back' | 'try-again' | 'retry' | 'close';

/** How long "Product added." shows under the new product's card header (US-100). */
export const PRODUCT_ADDED_MS = 5_000;

const CONFLICT_TEXT = 'That SKU was added by someone else since you started. Nothing was saved.';

/**
 * Review → Save product → write for a NEW product (CR-05, US-100). The ONLY
 * caller of `approveCreate()`. Its own steps (named like `ReviewFlow`'s), since
 * a create has its own approval and result; the strip shape and the "Nothing
 * was changed." / half-saved texts are the shared ones. One approval is sealed
 * per Save product and kept, so Try again sends the SAME approval and the
 * writer never adds the product twice (US-97). Each confirmed row goes into
 * the loaded data at once; the opening stock is logged once, when Master is
 * confirmed. `save()` / `retry()` return the new Master row's ref when the
 * product should open (`ProductNavigation` opens it).
 */
@Injectable({ providedIn: 'root' })
export class NewProductReviewStore {
  private readonly details = inject(DetailsStore);
  private readonly writer = inject(SheetsWriter);
  private readonly sheets = inject(SheetsStore);
  private readonly log = inject(StockLogStore);
  private readonly config = inject(AppConfig);
  private readonly panels = inject(PanelStore);

  private readonly stepSignal = signal<ReviewStep>('editing');
  private readonly messageSignal = signal<string | null>(null);
  private readonly failureKindSignal = signal<WriteFailureKind | null>(null);
  private readonly addedSignal = signal<string | null>(null);
  private approved: ApprovedCreate | null = null;
  private remaining: ApprovedCreate | null = null;
  private masterRef: RowRef | null = null;
  private written: string[] = [];
  private logged = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly step = this.stepSignal.asReadonly();
  /** "Master and Dr Trust" or "Master" while the product shows its green strip (5 s), else null. */
  readonly addedSheets = this.addedSignal.asReadonly();

  /** What the review lists: every filled field in form order (blank optional ones left out). */
  readonly lines = computed<readonly NewProductLine[]>(() => {
    const texts = this.details.texts();
    return EDITABLE_DETAILS.filter((def) => texts[def.key].trim() !== '').map((def) => ({
      field: def.key,
      label: def.newLabel ?? def.label,
      value: texts[def.key],
    }));
  });
  readonly targetsText = this.details.newTargets;
  readonly stockStatus = this.details.newStockStatus;

  /** The one result strip in the review, or null while reviewing / saving. */
  readonly strip = computed<ResultStrip<NewProductStripAction> | null>(() => {
    const message = this.messageSignal() ?? '';
    switch (this.stepSignal()) {
      case 'conflict':
        return problem(CONFLICT_TEXT, { label: 'Back', action: 'back' }, null);
      case 'failed':
        return problem(
          failureText(message, this.failureKindSignal()),
          { label: 'Try again', action: 'try-again' },
          { label: 'Back', action: 'back' },
        );
      case 'partial': {
        const behind = this.behind();
        return {
          variant: 'warning',
          lead: '',
          message: partialText(message),
          primary: behind === '' ? null : { label: `Retry ${behind}`, action: 'retry' },
          secondary: { label: 'Close', action: 'close' },
        };
      }
      default:
        return null;
    }
  });

  constructor() {
    // The New product form closed (Cancel / X, sign-out, a product opened): the review goes too.
    effect(() => {
      if (!this.panels.newProductOpen()) {
        untracked(() => this.reset());
      }
    });
  }

  /** Review product: only with valid entries, not while saving. */
  open(): void {
    if (this.details.newValues() !== null && this.stepSignal() === 'editing') {
      this.messageSignal.set(null);
      this.stepSignal.set('reviewing');
    }
  }

  /** Back to the form, entries kept (not while saving). */
  back(): void {
    if (this.stepSignal() !== 'saving' && this.stepSignal() !== 'partial') {
      this.messageSignal.set(null);
      this.stepSignal.set('editing');
    }
  }

  /**
   * The user's Save product tap (from the review) or Try again (after a
   * failure): seals the approval once, keeps it, and writes it. Returns the new
   * Master row's ref when every sheet is confirmed (the product opens), else null.
   */
  async save(): Promise<RowRef | null> {
    const step = this.stepSignal();
    if (step !== 'reviewing' && step !== 'failed') {
      return null;
    }
    if (step === 'reviewing' || this.approved === null) {
      const values = this.details.newValues();
      if (values === null) {
        return null;
      }
      try {
        this.approved = approveCreate(values, this.config.sheet('dr-trust').brand);
      } catch (error) {
        if (error instanceof InvalidChangeError) {
          this.fail(error.message, 'invalid');
          return null;
        }
        throw error;
      }
      this.written = [];
      this.logged = false;
      this.masterRef = null;
    }
    return this.send(this.approved);
  }

  /** Retry after a half save: appends only the sheets still missing (the writer's `remaining`). */
  async retry(): Promise<RowRef | null> {
    if (this.stepSignal() !== 'partial' || this.remaining === null) {
      return null;
    }
    return this.send(this.remaining);
  }

  /** Close after a half save: the product opens as it is (Master only); returns its ref. */
  closePartial(): RowRef | null {
    if (this.stepSignal() !== 'partial') {
      return null;
    }
    const ref = this.masterRef;
    this.reset();
    return ref;
  }

  private async send(approved: ApprovedCreate): Promise<RowRef | null> {
    this.messageSignal.set(null);
    this.failureKindSignal.set(null);
    this.stepSignal.set('saving');
    const result = await this.writer.create(approved);
    return this.handle(result);
  }

  private handle(result: CreateResult): RowRef | null {
    switch (result.kind) {
      case 'written': {
        this.confirm(result.sheets);
        const ref = this.masterRef;
        this.showAdded(this.written.join(' and '));
        this.reset();
        return ref;
      }
      case 'partial': {
        this.confirm(result.written);
        this.remaining = result.remaining;
        const added = this.written.join(' and ');
        this.messageSignal.set(`${added} was added. ${result.error.sheetLabel} was not: ${result.error.message}`);
        this.stepSignal.set('partial');
        return null;
      }
      case 'conflict':
      case 'failed': {
        const reason = result.kind === 'conflict' ? result.message : result.error.message;
        if (this.written.length > 0) {
          // A Retry that still did not finish: an earlier sheet has the product, so it stays half saved.
          this.messageSignal.set(`${this.written.join(' and ')} was added. ${this.behind()} still not added: ${reason}`);
          this.stepSignal.set('partial');
        } else if (result.kind === 'conflict') {
          this.messageSignal.set(reason);
          this.stepSignal.set('conflict');
        } else {
          this.fail(reason, result.error.kind);
        }
        return null;
      }
    }
  }

  /** Confirmed rows go into the loaded data; the opening stock is logged once, with Master. */
  private confirm(rows: readonly CreatedRow[]): void {
    for (const row of rows) {
      if (this.written.includes(row.sheet.label)) {
        continue; // already in the loaded data from an earlier attempt
      }
      this.sheets.addRow(row.ref, row.product);
      this.written.push(row.sheet.label);
      if (row.sheet.key === 'master') {
        this.masterRef = row.ref;
        if (!this.logged && row.product.stockQty !== null) {
          this.logged = true;
          this.log.record({ mode: 'New product', sku: row.product.sku, before: null, after: row.product.stockQty });
        }
      }
    }
  }

  /** The sheet(s) a half save is still missing, by label. */
  private behind(): string {
    return this.remaining?.sheets.map((key) => this.config.sheet(key).label).join(' and ') ?? '';
  }

  private fail(message: string, kind: WriteFailureKind): void {
    this.failureKindSignal.set(kind);
    this.messageSignal.set(message);
    this.stepSignal.set('failed');
  }

  private showAdded(sheets: string): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.addedSignal.set(sheets);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.addedSignal.set(null);
    }, PRODUCT_ADDED_MS);
  }

  /** Back to the start (the approval, a pending Retry and the messages go). */
  private reset(): void {
    this.approved = null;
    this.remaining = null;
    this.messageSignal.set(null);
    this.failureKindSignal.set(null);
    this.stepSignal.set('editing');
  }
}

function problem(
  message: string,
  primary: ResultStrip<NewProductStripAction>['primary'],
  secondary: ResultStrip<NewProductStripAction>['secondary'],
): ResultStrip<NewProductStripAction> {
  return { variant: 'problem', lead: '', message, primary, secondary };
}
