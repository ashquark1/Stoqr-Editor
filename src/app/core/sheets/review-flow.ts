import { computed, inject, signal } from '@angular/core';

import { AppConfig } from '@core/config/app-config';
import { ApprovedChange, InvalidChangeError } from './approval';
import { SheetsStore } from './sheets-store';
import { SheetWritten, SheetsWriter, WriteFailureKind, WriteResult } from './sheets-writer';

export type ReviewStep = 'editing' | 'reviewing' | 'saving' | 'conflict' | 'partial' | 'failed';

/** One result strip in the card (US-76, US-80): look, text and up to two actions of the store's own kind. */
export interface ResultStrip<A extends string> {
  readonly variant: 'success' | 'problem' | 'warning';
  readonly lead: string;
  readonly message: string;
  readonly primary: { readonly label: string; readonly action: A } | null;
  readonly secondary: { readonly label: string; readonly action: A } | null;
}

/** What differs between the review steps that use this flow (stock, details). */
export interface ReviewOutcomes<C> {
  /**
   * Every sheet confirmed; `labels` are all the sheets written, in order;
   * `retried`: a Retry finished a half-done save. The flow then returns to editing.
   */
  readonly written: (context: C, labels: readonly string[], retried: boolean) => void;
  /** Called on a conflict (e.g. to clear an entry made against the old value). */
  readonly conflict?: (context: C) => void;
  /** Nothing was saved: a reviewed value changed underneath. */
  readonly conflictMessage: (
    result: Extract<WriteResult, { kind: 'conflict' }>,
    context: C,
  ) => string;
  /**
   * Some sheets written, the rest not. `retried`: this is a Retry that still
   * did not finish. `notUpdated` names the sheet(s) still behind.
   */
  readonly partialMessage: (
    context: C,
    writtenLabels: readonly string[],
    notUpdated: string,
    reason: string,
    retried: boolean,
  ) => string;
  /** Called on the first partial result (e.g. to clear an amount that must not be applied twice). */
  readonly partial?: (context: C) => void;
}

/** A half-done linked save that Retry can finish (US-34). */
interface PendingRetry<C> {
  /** The unwritten rows of the user's original approval. */
  readonly approved: ApprovedChange;
  readonly context: C;
  /** Labels of the sheets already written and confirmed. */
  readonly writtenLabels: readonly string[];
}

/**
 * The save → outcome steps shared by every approved save (stock Apply US-64,
 * details review US-23, 24, 36): writes through `SheetsWriter`, puts confirmed
 * values into the loaded data, reports conflict / failed / partial, and
 * finishes a partial save with Retry from the ORIGINAL approval (never a new
 * one). Create it inside a store (it injects its services); the store builds
 * the approval, so `approve()` is still called only from `core/stock-adjust/`
 * and `core/details/`.
 */
export class ReviewFlow<C> {
  private readonly writer = inject(SheetsWriter);
  private readonly sheets = inject(SheetsStore);
  private readonly config = inject(AppConfig);

  private readonly stepSignal = signal<ReviewStep>('editing');
  private readonly messageSignal = signal<string | null>(null);
  private readonly pendingSignal = signal<PendingRetry<C> | null>(null);
  private readonly failureKindSignal = signal<WriteFailureKind | null>(null);

  readonly step = this.stepSignal.asReadonly();
  /** Why the last save did not fully succeed (conflict / partial / failed), or null. */
  readonly message = this.messageSignal.asReadonly();
  /** Why the last save failed with the `failed` step (e.g. `unconfirmed`: it may have saved), or null. */
  readonly failureKind = this.failureKindSignal.asReadonly();
  /**
   * The failure's reason plus " Nothing was changed." — added only when that
   * is certain: never for `unconfirmed` (Google may have saved), and not when
   * the reason already says nothing was saved (US-76, US-80).
   */
  readonly failureText = computed(() => {
    const message = this.messageSignal() ?? '';
    const certain =
      this.failureKindSignal() !== 'unconfirmed' && !/nothing was (saved|changed)/i.test(message);
    return certain ? `${message} Nothing was changed.` : message;
  });
  /** The half-saved message plus " The sheets differ until you retry." */
  readonly partialText = computed(
    () => `${this.messageSignal() ?? ''} The sheets differ until you retry.`,
  );
  /** The sheet(s) Retry would finish ("Dr Trust"), or null when there is nothing to retry. */
  readonly retryLabel = computed(() => {
    const pending = this.pendingSignal();
    return pending === null ? null : this.labelsOf(pending.approved).join(' and ');
  });

  /**
   * `saveFrom`: the steps a save may start from. Details: after its review (or
   * a failure). Stock (CR-04, no review): editing, conflict or failed. Never
   * saving or partial, so one tap writes once.
   */
  constructor(
    private readonly outcomes: ReviewOutcomes<C>,
    private readonly saveFrom: readonly ReviewStep[] = ['reviewing', 'failed'],
  ) {}

  /** Opens the review (not while saving); the store checks the change is ready first. */
  open(): void {
    if (this.stepSignal() !== 'saving') {
      this.messageSignal.set(null);
      this.stepSignal.set('reviewing');
    }
  }

  /** Back to editing (not while saving). */
  back(): void {
    if (this.stepSignal() !== 'saving') {
      this.reset();
    }
  }

  /** Back to editing, dropping any pending Retry. */
  reset(): void {
    this.pendingSignal.set(null);
    this.failureKindSignal.set(null);
    this.messageSignal.set(null);
    this.stepSignal.set('editing');
  }

  /** Saving may start only from this flow's `saveFrom` steps (never while saving or half saved). */
  canSave(): boolean {
    return this.saveFrom.includes(this.stepSignal());
  }

  /**
   * Seals the approval with `build` (which calls `approve()`) and writes it.
   * An approval `approve()` refuses becomes a failure with its message.
   */
  async save(build: () => ApprovedChange, context: C): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    let approved: ApprovedChange;
    try {
      approved = build();
    } catch (error) {
      if (error instanceof InvalidChangeError) {
        this.messageSignal.set(error.message);
        this.stepSignal.set('failed');
        return;
      }
      throw error;
    }
    this.messageSignal.set(null);
    this.failureKindSignal.set(null);
    this.stepSignal.set('saving');
    this.handle(await this.writer.write(approved), context);
  }

  /**
   * Finishes a partial save: writes only the rows not yet written, from the
   * original approval (same values; an already written sheet is never
   * rewritten). Works only from the partial step, so a double click writes once.
   */
  async retry(): Promise<void> {
    const pending = this.pendingSignal();
    if (this.stepSignal() !== 'partial' || pending === null) {
      return;
    }
    this.messageSignal.set(null);
    this.stepSignal.set('saving');
    const result = await this.writer.write(pending.approved);
    if (result.kind === 'written') {
      this.applyWritten(result.sheets);
      this.succeed(pending.context, [...pending.writtenLabels, ...labelsOf(result.sheets)], true);
      return;
    }
    // An earlier sheet is already written: whatever happened now, it is still partial.
    let next = pending;
    if (result.kind === 'partial') {
      this.applyWritten(result.written);
      next = {
        ...pending,
        approved: result.remaining,
        writtenLabels: [...pending.writtenLabels, ...labelsOf(result.written)],
      };
    }
    const reason =
      result.kind === 'conflict'
        ? `${result.sheet.label} changed while saving.`
        : result.error.message;
    this.toPartial(
      next,
      this.outcomes.partialMessage(
        next.context,
        next.writtenLabels,
        this.labelsOf(next.approved).join(' and '),
        reason,
        true,
      ),
    );
  }

  private handle(result: WriteResult, context: C): void {
    switch (result.kind) {
      case 'written':
        this.applyWritten(result.sheets);
        this.succeed(context, labelsOf(result.sheets), false);
        return;
      case 'conflict':
        this.sheets.applyRow(result.ref, result.current.product, result.current.issues);
        this.outcomes.conflict?.(context);
        this.messageSignal.set(this.outcomes.conflictMessage(result, context));
        this.stepSignal.set('conflict');
        return;
      case 'partial': {
        this.applyWritten(result.written);
        this.outcomes.partial?.(context);
        const writtenLabels = labelsOf(result.written);
        this.toPartial(
          { approved: result.remaining, context, writtenLabels },
          this.outcomes.partialMessage(
            context,
            writtenLabels,
            result.error.sheetLabel,
            result.error.message,
            false,
          ),
        );
        return;
      }
      case 'failed':
        this.failureKindSignal.set(result.error.kind);
        this.messageSignal.set(result.error.message);
        this.stepSignal.set('failed');
        return;
    }
  }

  private applyWritten(sheets: readonly SheetWritten[]): void {
    sheets.forEach((s) => this.sheets.applyRow(s.ref, s.product));
  }

  private succeed(context: C, labels: readonly string[], retried: boolean): void {
    this.outcomes.written(context, labels, retried);
    this.reset();
  }

  private toPartial(pending: PendingRetry<C>, message: string): void {
    this.pendingSignal.set(pending);
    this.messageSignal.set(message);
    this.stepSignal.set('partial');
  }

  private labelsOf(approved: ApprovedChange): string[] {
    return approved.rows.map((row) => this.config.sheet(row.target.sheet).label);
  }
}

function labelsOf(sheets: readonly SheetWritten[]): string[] {
  return sheets.map((s) => s.sheet.label);
}
