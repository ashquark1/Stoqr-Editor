import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { AppConfig } from '@core/config/app-config';
import { ProductSearchStore } from '@core/search/product-search-store';
import { approve } from '@core/sheets/approval';
import { ResultStrip, ReviewFlow } from '@core/sheets/review-flow';
import { DiffLine, StatusLine, detailRowChanges, diffLines, statusLines } from './details-diff';
import { DETAIL_FIELDS } from './details-fields';
import { DetailsStore } from './details-store';

/** What the details review shows (US-23); null when nothing can be reviewed. */
export interface DetailsReview {
  /** "Master and Dr Trust" or "Master". */
  readonly sheetsText: string;
  readonly drTrustLabel: string;
  /** Set when a new SKU links this master-only product to an unmatched Dr Trust row (US-38). */
  readonly linkNote: string | null;
  readonly lines: readonly DiffLine[];
  /** Stock Status changes the save brings (derived per sheet), labelled by sheet. */
  readonly statuses: readonly (StatusLine & { readonly sheetLabel: string })[];
}

/** Buttons on a details result strip (US-80). */
export type DetailsStripAction = 'review-again' | 'back' | 'try-again' | 'retry' | 'close';

/** How long "Details saved." shows under the card header (US-80). */
export const DETAILS_SAVED_MS = 5_000;

/** What a details save's messages need. */
interface DetailsSave {
  readonly productName: string;
}

/**
 * Review → approve → write for a details edit (US-23, US-24, US-36). The ONLY
 * caller of `approve()` for details. Only the changed fields are written, to
 * both sheets of a linked product, each guarded by that sheet's own current
 * values of those fields; Stock Status and Last Updated are filled in by the
 * writer. On success the review and form close, the tiles show the saved
 * values, and "Details saved." shows under the header for 5 s (US-80; the
 * product stays open). Other outcomes are strips in the review. The steps
 * themselves are the shared `ReviewFlow`.
 */
@Injectable({ providedIn: 'root' })
export class DetailsReviewStore {
  private readonly details = inject(DetailsStore);
  private readonly search = inject(ProductSearchStore);
  private readonly config = inject(AppConfig);

  private readonly savedSignal = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  private readonly flow = new ReviewFlow<DetailsSave>({
    written: (_save, labels) => {
      // The review and the form close; the tiles show the confirmed values.
      this.details.closeForm();
      this.showSaved(labels.join(' and '));
    },
    conflictMessage: (result) =>
      `${fieldLabels(result.fields)} changed in ${result.sheet.label} since you opened this product. ` +
      'Nothing was saved. The form now shows the new values; review again.',
    partialMessage: (_save, writtenLabels, notUpdated, reason, retried) =>
      `${writtenLabels.join(' and ')} was updated. ${notUpdated} ${retried ? 'still not updated' : 'was not updated'}: ${reason}`,
    // The written sheet now holds the edits: drop them so they cannot be saved twice.
    partial: () => this.details.reset(),
  });

  readonly step = this.flow.step;
  /** Why the last save did not fully succeed (conflict / partial / failed), or null. */
  readonly message = this.flow.message;
  /** The sheets just saved ("Master and Dr Trust"), for the "Details saved." strip under the header (5 s), or null. */
  readonly savedSheets = this.savedSignal.asReadonly();
  /** Details were just saved (US-80). */
  readonly saved = computed(() => this.savedSignal() !== null);

  /** The result strip inside the review (conflict / failed / half saved), or null (US-80). */
  readonly strip = computed<ResultStrip<DetailsStripAction> | null>(() => {
    const message = this.message() ?? '';
    switch (this.step()) {
      case 'conflict':
        return problem(message, { label: 'Review again', action: 'review-again' });
      case 'failed':
        return problem(this.flow.failureText(), { label: 'Try again', action: 'try-again' });
      case 'partial': {
        const retry = this.retryLabel();
        return {
          variant: 'warning',
          lead: '',
          message: this.flow.partialText(),
          primary: retry === null ? null : { label: `Retry ${retry}`, action: 'retry' },
          secondary: { label: 'Close', action: 'close' },
        };
      }
      default:
        return null;
    }
  });
  /** The sheet(s) Retry would finish ("Dr Trust"), or null when there is nothing to retry. */
  readonly retryLabel = this.flow.retryLabel;

  readonly review = computed<DetailsReview | null>(() => {
    const selected = this.search.selected();
    const changed = this.details.changes();
    if (selected === null || changed.size === 0) {
      return null;
    }
    const linkTo = this.details.linkTo();
    const link = this.search.selectedLink() ?? linkTo;
    const masterLabel = this.config.sheet('master').label;
    const drTrustLabel = this.config.sheet('dr-trust').label;
    const drTrust = link?.product ?? null;
    return {
      sheetsText: link ? `${masterLabel} and ${drTrustLabel}` : masterLabel,
      drTrustLabel,
      linkNote:
        linkTo === null
          ? null
          : `This links it to the ${drTrustLabel} row "${linkTo.product.productName}" (qty ${linkTo.product.stockQty ?? 'blank'}). ` +
            'Later changes save to both sheets.',
      lines: diffLines(changed, selected.product, drTrust),
      statuses: statusLines(changed, selected.product, drTrust).map((s) => ({
        ...s,
        sheetLabel: s.sheet === 'master' ? masterLabel : drTrustLabel,
      })),
    };
  });

  constructor() {
    let lastRef = untracked(() => this.search.selected()?.ref ?? null);
    effect(() => {
      const ref = this.search.selected()?.ref ?? null;
      if (ref !== lastRef) {
        lastRef = ref;
        untracked(() => {
          this.flow.reset();
          this.clearSaved();
        });
      }
    });
  }

  /** Opens the review when the form is changed and valid. */
  open(): void {
    if (this.details.canReview()) {
      this.clearSaved();
      this.flow.open();
    }
  }

  /** Back to the form (not while saving); the edits are kept. Close after a half-done save also closes the form (US-66). */
  back(): void {
    const halfSaved = this.flow.step() === 'partial';
    this.flow.back();
    if (halfSaved) {
      this.details.closeForm();
    }
  }

  /** A strip button (US-80). */
  stripAction(action: DetailsStripAction): void {
    switch (action) {
      case 'review-again':
        this.open();
        return;
      case 'try-again':
        void this.approve();
        return;
      case 'retry':
        void this.retry();
        return;
      case 'back':
      case 'close':
        this.back();
        return;
    }
  }

  /** Ends the "Details saved." strip. */
  clearSaved(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.savedSignal.set(null);
  }

  private showSaved(sheets: string): void {
    this.clearSaved();
    this.savedSignal.set(sheets);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.savedSignal.set(null);
    }, DETAILS_SAVED_MS);
  }

  /**
   * The user's explicit approval. Works only from the review (or after a
   * failure with nothing written) and only for an editable product with a
   * reviewable change, so a double click cannot write twice.
   */
  async approve(): Promise<void> {
    if (!this.flow.canSave()) {
      return;
    }
    const selected = this.search.selected();
    if (selected === null || !this.details.canReview()) {
      this.flow.reset();
      return;
    }
    // A new SKU may link a master-only product to an unmatched Dr Trust row: both are written (US-38).
    const link = this.search.selectedLink() ?? this.details.linkTo();
    const rows = detailRowChanges(this.details.changes(), selected, link);
    await this.flow.save(() => approve(...rows), { productName: selected.product.productName });
  }

  /** Finishes a partial save from the original approval (an already written sheet is never rewritten). */
  retry(): Promise<void> {
    return this.flow.retry();
  }
}

function fieldLabels(fields: readonly string[]): string {
  return DETAIL_FIELDS.filter((def) => fields.includes(def.key))
    .map((def) => def.label)
    .join(', ');
}

function problem(
  message: string,
  primary: ResultStrip<DetailsStripAction>['primary'],
): ResultStrip<DetailsStripAction> {
  return {
    variant: 'problem',
    lead: '',
    message,
    primary,
    secondary: { label: 'Back', action: 'back' },
  };
}
